import { uploadStream } from '../storage/client.js';
import { publishBatchReceived } from '../kafka/producer.js';
import { findPharmacyByCnpj, createBatch, getBatchByIdempotencyKey, upsertPharmacy } from '../db/queries.js';
import { logBatchReceived, logBatchError } from '../utils/logger.js';
import crypto from 'crypto';

const normalizeString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildPharmacyPayload = (product, cnpj) => {
  return {
    cnpj,
    name: normalizeString(
      product?.PHARMACY_NAME ??
      product?.PHARMACY ??
      product?.SHOP_NAME ??
      product?.SHOPNAME ??
      product?.NAME
    ) || `Farmacia ${cnpj}`,
    state: normalizeString(product?.STATE ?? product?.UF),
    city: normalizeString(product?.CITY ?? product?.CIDADE),
    rawJson: product || {}
  };
};

export async function ingestProducts(request, reply) {
  const apiKey = request.headers['x-inova-api-key'];
  const loadType = request.headers['x-inova-load-type'];
  let idempotencyKey = request.headers['idempotency-key'];

  // Validate headers
  if (!apiKey || !loadType) {
    return reply.code(400).send({
      error: 'Missing required headers',
      required: ['X-Inova-Api-Key', 'X-Inova-Load-Type']
    });
  }

  if (!['delta', 'full'].includes(loadType)) {
    return reply.code(400).send({
      error: 'Invalid load type',
      message: 'X-Inova-Load-Type must be "delta" or "full"'
    });
  }

  const validApiKeys = (process.env.VALID_API_KEYS || '').split(',');
  if (!validApiKeys.includes(apiKey)) {
    return reply.code(401).send({ error: 'Invalid API key' });
  }

  let cnpj;
  let pharmacy;
  let batchId;

  try {
    // Get parsed body from Fastify
    const products = request.body;
    
    if (!Array.isArray(products) || products.length === 0) {
      return reply.code(400).send({ error: 'Payload must be a non-empty array' });
    }

    const primaryProduct = products[0];
    cnpj = primaryProduct.CNPJ;
    if (!cnpj) {
      return reply.code(400).send({ error: 'CNPJ not found in payload' });
    }

    // Generate idempotency key if not provided
    if (!idempotencyKey) {
      const timestamp = Date.now();
      const hash = crypto.createHash('md5')
        .update(JSON.stringify(products))
        .digest('hex')
        .substring(0, 8);
      idempotencyKey = `auto-${cnpj}-${timestamp}-${hash}`;
    }

    // Find pharmacy
    const pharmacyPayload = buildPharmacyPayload(primaryProduct, cnpj);
    pharmacy = await findPharmacyByCnpj(cnpj);
    if (!pharmacy) {
      pharmacy = await upsertPharmacy(pharmacyPayload);
    }

    // Check for existing batch with same idempotency key
    const existingBatch = await getBatchByIdempotencyKey(pharmacy.id, idempotencyKey);
    if (existingBatch) {
      logBatchReceived(existingBatch.batch_id, cnpj, loadType, 0);
      return reply.code(202).send({
        batch_id: existingBatch.batch_id,
        status: existingBatch.status,
        received_at: existingBatch.created_at,
        message: 'Batch already received (idempotent)'
      });
    }

    // Upload to storage
    console.log(`📦 Uploading ${products.length} products to storage...`);
    const objectName = `batches/${cnpj}/${Date.now()}-${idempotencyKey}.json`;
    const payloadBuffer = Buffer.from(JSON.stringify(products));
    const payloadSize = payloadBuffer.length;
    
    console.log(`📊 Payload size: ${(payloadSize / 1024).toFixed(2)} KB`);
    
    // Calculate checksum
    const checksum = crypto.createHash('sha256').update(payloadBuffer).digest('hex');
    console.log(`🔐 Checksum: ${checksum}`);
    
    // Upload to MinIO
    console.log(`⬆️  Uploading to MinIO: ${objectName}`);
    await uploadStream(objectName, payloadBuffer, payloadSize, {
      'content-type': 'application/json',
      'x-cnpj': cnpj,
      'x-load-type': loadType,
      'x-checksum': checksum
    });
    console.log(`✅ Upload complete`);

    // Create batch record
    const batch = await createBatch(
      pharmacy.id,
      loadType,
      idempotencyKey,
      objectName,
      checksum,
      products.length
    );

    batchId = batch.batch_id;

    // Publish to Kafka
    await publishBatchReceived(batchId, cnpj, loadType);

    logBatchReceived(batchId, cnpj, loadType, payloadSize);

    return reply.code(202).send({
      batch_id: batchId,
      status: 'RECEIVED',
      received_at: batch.created_at
    });

  } catch (error) {
    logBatchError(batchId || 'unknown', cnpj || 'unknown', error);
    
    return reply.code(500).send({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
