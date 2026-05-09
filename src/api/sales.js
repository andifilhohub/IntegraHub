import {
  createSale,
  findPharmacyByCnpj,
  getSaleByIdAndCnpj,
  getSaleByIdempotencyKey,
  listPendingSalesByCnpj,
  listConsumedSalesByCnpj,
  consumeSaleByCnpj,
  upsertPharmacy
} from '../db/queries.js';
import { getObject, uploadObject } from '../storage/client.js';
import { publishSaleReceived } from '../kafka/producer.js';
import { persistErrorLog } from '../db/error-log.js';
import { authenticate } from './auth.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// Gambiarra: criar arquivo flag quando houver 401
const createUnauthorizedFlag = async (cnpj, endpoint) => {
  try {
    const flagFile = path.join(process.cwd(), '.unauthorized-request');
    const message = `[${new Date().toISOString()}] ${endpoint} - CNPJ: ${cnpj}\n`;
    await fs.appendFile(flagFile, message, 'utf-8');
  } catch (err) {
    // Silenciosamente ignorar erros ao criar flag
  }
};

async function fireSaleConsumedWebhook(data, log) {
  const baseUrl = process.env.INTEGRAHUB_BASE_URL;
  const accountId = process.env.INTEGRAHUB_ACCOUNT_ID;
  const apiKey = process.env.INTEGRAHUB_API_KEY;

  if (!baseUrl || !accountId || !apiKey) return;

  const url = `${baseUrl}/api/v1/accounts/${accountId}/integrahub_webhooks/sale_consumed`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        codigo_venda_online: data.codigo_venda_online,
        consumed_at: data.consumed_at,
        consumed_by: data.consumed_by,
      }),
    });

    if (!res.ok) {
      log.warn({ status: res.status, url }, 'sale_consumed webhook returned non-2xx');
    }
  } catch (err) {
    log.error({ err: err.message, url }, 'Failed to fire sale_consumed webhook');
  }
}

const normalizeString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildFallbackPharmacy = (cnpj) => ({
  cnpj,
  name: `Farmacia ${cnpj}`,
  state: null,
  city: null,
  rawJson: {}
});

export async function ingestSale(request, reply) {
  try {
    const auth = await authenticate(request);
    if (!auth) {
      await createUnauthorizedFlag('unknown', request.url);
      request.log.warn({ 
        path: request.url,
        method: request.method,
        headers: Object.keys(request.headers).filter(k => k.toLowerCase().includes('auth') || k.toLowerCase().includes('key') || k.toLowerCase().includes('api'))
      }, 'ingestSale: Auth failed');
      
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Valid API key required. Use Authorization: Bearer {token}, X-Api-Key: {token}, or x-inova-api-key: {token} header'
      });
    }

    const payload = request.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Payload must be a JSON object'
      });
    }

    const cnpjEmpresa = normalizeString(payload.cnpjEmpresa);
    const codigoVendaOnLine = normalizeString(payload.codigoVendaOnLine);
    const dataVendaRaw = payload.dataVenda;

    if (!cnpjEmpresa || !codigoVendaOnLine || !dataVendaRaw) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Fields cnpjEmpresa, codigoVendaOnLine and dataVenda are required'
      });
    }

    if (auth.pharmacy && auth.pharmacy.cnpj !== cnpjEmpresa) {
      request.log.warn({ 
        payloadCnpj: cnpjEmpresa,
        pharmacyCnpj: auth.pharmacy.cnpj,
        message: 'CNPJ mismatch'
      }, 'ingestSale: Auth mismatch');
      
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'API key does not belong to the CNPJ in the payload'
      });
    }

    const dataVenda = new Date(dataVendaRaw);
    if (Number.isNaN(dataVenda.getTime())) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'dataVenda must be a valid ISO date'
      });
    }

    let idempotencyKey = request.headers['idempotency-key'];

    let pharmacy = await findPharmacyByCnpj(cnpjEmpresa);
    if (!pharmacy) {
      pharmacy = await upsertPharmacy(buildFallbackPharmacy(cnpjEmpresa));
    }

    const payloadBuffer = Buffer.from(JSON.stringify(payload));
    const payloadSize = payloadBuffer.length;
    const checksum = crypto.createHash('sha256').update(payloadBuffer).digest('hex');

    if (!idempotencyKey) {
      // Content-only hash so the same payload always maps to the same key.
      // Using Date.now() here caused different keys for the same payload on
      // retries, bypassing the idempotency check and creating duplicate rows.
      const hash = crypto.createHash('md5').update(payloadBuffer).digest('hex').substring(0, 16);
      idempotencyKey = `auto-${cnpjEmpresa}-${hash}`;
    }

    const existingSale = await getSaleByIdempotencyKey(pharmacy.id, idempotencyKey);
    if (existingSale) {
      return reply.status(202).send({
        sale_id: existingSale.sale_id,
        status: existingSale.status,
        received_at: existingSale.created_at,
        message: 'Sale already received (idempotent)'
      });
    }

    const objectName = `sales/${cnpjEmpresa}/${Date.now()}-${idempotencyKey}.json`;
    await uploadObject(objectName, payloadBuffer, {
      'content-type': 'application/json',
      'x-cnpj': cnpjEmpresa,
      'x-checksum': checksum
    });

    const sale = await createSale({
      pharmacyId: pharmacy.id,
      cnpj: cnpjEmpresa,
      codigoVendaOnLine,
      dataVenda: dataVenda.toISOString(),
      nomeCliente: normalizeString(payload.nomeCliente),
      tipoDeEcommerce: normalizeString(payload.tipoDeEcommerce),
      entrega: payload.entrega || {},
      produtos: payload.produtos || [],
      pagamentos: payload.pagamentos || [],
      vendedor: payload.vendedor || null,
      rawJson: null,
      idempotencyKey,
      payloadUri: objectName,
      payloadChecksum: checksum,
      payloadSize
    });

    await publishSaleReceived(sale.sale_id, cnpjEmpresa, pharmacy.id, objectName);

    return reply.status(202).send({
      sale_id: sale.sale_id,
      status: sale.status,
      received_at: sale.created_at
    });
  } catch (error) {
    request.log.error({ error: error.message, stack: error.stack }, 'Error ingesting sale');
    await persistErrorLog({
      source: 'api_request',
      event: 'ingest_sale.error',
      severity: 'ERROR',
      cnpj: payload?.cnpjEmpresa || null,
      errorMessage: error.message,
      errorCode: error.code || null,
      errorContext: { stack: error.stack ? String(error.stack).slice(0, 4000) : null },
      requestPath: request.url,
      requestMethod: request.method,
      httpStatus: 500,
    });
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export async function listPendingSalesHandler(request, reply) {
  try {
    const cnpj = normalizeString(request.params.cnpj || request.query.cnpj);
    
    const auth = await authenticate(request);
    if (!auth) {
      await createUnauthorizedFlag(cnpj || 'unknown', 'GET /api/v1/inovafarma/sales/:cnpj/pending');
      request.log.warn({ 
        cnpj,
        path: request.url,
        headers: Object.keys(request.headers).filter(k => k.toLowerCase().includes('auth') || k.toLowerCase().includes('key') || k.toLowerCase().includes('api'))
      }, 'listPendingSales: Auth failed');
      
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Valid API key required. Use Authorization: Bearer {token}, X-Api-Key: {token}, or x-inova-api-key: {token} header'
      });
    }

    if (auth.pharmacy && auth.pharmacy.cnpj !== cnpj) {
      request.log.warn({ 
        cnpj,
        pharmacyCnpj: auth.pharmacy.cnpj,
        message: 'CNPJ mismatch'
      }, 'listPendingSales: Auth mismatch');
      
      return reply.status(403).send({ error: 'Forbidden', message: 'API key does not belong to the requested CNPJ' });
    }
    if (!cnpj) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'cnpj is required'
      });
    }

    const limit = Math.min(parseInt(request.query.limit) || 100, 500);
    const sales = await listPendingSalesByCnpj(cnpj, limit);

    return reply.send({
      sales: sales.map((row) => ({
        id: row.sale_id,
        created_at: row.created_at
      }))
    });
  } catch (error) {
    request.log.error({ error: error.message, stack: error.stack }, 'Error listing pending sales');
    await persistErrorLog({
      source: 'api_request',
      event: 'list_pending_sales.error',
      severity: 'ERROR',
      cnpj: request.params?.cnpj || request.query?.cnpj || null,
      errorMessage: error.message,
      errorCode: error.code || null,
      errorContext: { stack: error.stack ? String(error.stack).slice(0, 4000) : null },
      requestPath: request.url,
      requestMethod: request.method,
      httpStatus: 500,
    });
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export async function getSaleByIdHandler(request, reply) {
  try {
    const cnpj = normalizeString(request.params.cnpj || request.query.cnpj);
    const saleId = request.params.id;
    
    const auth = await authenticate(request);
    if (!auth) {
      await createUnauthorizedFlag(cnpj || 'unknown', 'GET /api/v1/inovafarma/sales/:cnpj/:id');
      request.log.warn({ 
        cnpj,
        saleId,
        path: request.url,
        headers: Object.keys(request.headers).filter(k => k.toLowerCase().includes('auth') || k.toLowerCase().includes('key') || k.toLowerCase().includes('api'))
      }, 'getSaleById: Auth failed');
      
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Valid API key required. Use Authorization: Bearer {token}, X-Api-Key: {token}, or x-inova-api-key: {token} header'
      });
    }

    if (auth.pharmacy && auth.pharmacy.cnpj !== cnpj) {
      request.log.warn({ 
        cnpj,
        pharmacyCnpj: auth.pharmacy.cnpj,
        saleId,
        message: 'CNPJ mismatch'
      }, 'getSaleById: Auth mismatch');
      
      return reply.status(403).send({ error: 'Forbidden', message: 'API key does not belong to the requested CNPJ' });
    }
    if (!cnpj) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'cnpj is required'
      });
    }

    const sale = await getSaleByIdAndCnpj(saleId, cnpj);

    if (!sale) {
      return reply.status(404).send({ error: 'Not Found', message: 'Sale not found' });
    }

    let payload = sale.raw_json;
    if (!payload && sale.payload_uri) {
      const stream = await getObject(sale.payload_uri);
      let buffer = '';
      stream.on('data', (chunk) => {
        buffer += chunk.toString();
      });
      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      payload = JSON.parse(buffer);
    }

    if (sale.status === 'PENDING') {
      const updated = await consumeSaleByCnpj(saleId, cnpj, 'inovafarma-auto', 'CONSUMED');
      if (updated?.status === 'CONSUMED') {
        fireSaleConsumedWebhook(updated, request.log);
        request.log.info({ saleId, cnpj }, 'Sale auto-consumed on GET');
      }
    }

    return reply.send(payload || {});
  } catch (error) {
    request.log.error({ error: error.message, stack: error.stack }, 'Error fetching sale by id');
    await persistErrorLog({
      source: 'api_request',
      event: 'get_sale_by_id.error',
      severity: 'ERROR',
      cnpj: request.params?.cnpj || request.query?.cnpj || null,
      errorMessage: error.message,
      errorCode: error.code || null,
      errorContext: { stack: error.stack ? String(error.stack).slice(0, 4000) : null },
      requestPath: request.url,
      requestMethod: request.method,
      httpStatus: 500,
    });
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export async function listConsumedSalesHandler(request, reply) {
  try {
    const cnpj = normalizeString(request.params.cnpj || request.query.cnpj);
    
    const auth = await authenticate(request);
    if (!auth) {
      request.log.warn({ 
        cnpj,
        path: request.url,
        headers: Object.keys(request.headers).filter(k => k.toLowerCase().includes('auth') || k.toLowerCase().includes('key') || k.toLowerCase().includes('api'))
      }, 'listConsumedSales: Auth failed');
      
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Valid API key required. Use Authorization: Bearer {token}, X-Api-Key: {token}, or x-inova-api-key: {token} header'
      });
    }

    if (auth.pharmacy && auth.pharmacy.cnpj !== cnpj) {
      request.log.warn({ 
        cnpj,
        pharmacyCnpj: auth.pharmacy.cnpj,
        message: 'CNPJ mismatch'
      }, 'listConsumedSales: Auth mismatch');
      
      return reply.status(403).send({ error: 'Forbidden', message: 'API key does not belong to the requested CNPJ' });
    }
    if (!cnpj) {
      return reply.status(400).send({ error: 'Bad Request', message: 'cnpj is required' });
    }

    const limit = Math.min(parseInt(request.query.limit) || 100, 500);
    const offset = Math.max(parseInt(request.query.offset) || 0, 0);
    const dateFrom = request.query.date_from ? new Date(request.query.date_from) : null;
    const dateTo = request.query.date_to ? new Date(request.query.date_to) : null;

    if (dateFrom && isNaN(dateFrom.getTime())) {
      return reply.status(400).send({ error: 'Bad Request', message: 'date_from must be a valid ISO date' });
    }
    if (dateTo && isNaN(dateTo.getTime())) {
      return reply.status(400).send({ error: 'Bad Request', message: 'date_to must be a valid ISO date' });
    }

    const { sales, total } = await listConsumedSalesByCnpj(cnpj, { dateFrom, dateTo, limit, offset });

    return reply.send({
      total,
      limit,
      offset,
      sales: sales.map((row) => ({
        id: row.sale_id,
        codigo_venda_online: row.codigo_venda_online,
        data_venda: row.data_venda,
        nome_cliente: row.nome_cliente,
        tipo_ecommerce: row.tipo_ecommerce,
        produtos: row.produtos,
        pagamentos: row.pagamentos,
        vendedor: row.vendedor,
        consumed_at: row.consumed_at,
        consumed_by: row.consumed_by,
        created_at: row.created_at,
      })),
    });
  } catch (error) {
    request.log.error({ error: error.message, stack: error.stack }, 'Error listing consumed sales');
    await persistErrorLog({
      source: 'api_request',
      event: 'list_consumed_sales.error',
      severity: 'ERROR',
      cnpj: request.params?.cnpj || request.query?.cnpj || null,
      errorMessage: error.message,
      errorCode: error.code || null,
      errorContext: { stack: error.stack ? String(error.stack).slice(0, 4000) : null },
      requestPath: request.url,
      requestMethod: request.method,
      httpStatus: 500,
    });
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export async function consumeSaleHandler(request, reply) {
  try {
    const auth = await authenticate(request);
    if (!auth) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Valid API key required. Use Authorization: Bearer {token} or X-Api-Key: {token}'
      });
    }

    const saleId = request.params.id;
    const cnpj = normalizeString(request.params.cnpj || request.query.cnpj);
    if (auth.pharmacy && auth.pharmacy.cnpj !== cnpj) {
      return reply.status(403).send({ error: 'Forbidden', message: 'API key does not belong to the requested CNPJ' });
    }
    if (!cnpj) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'cnpj is required'
      });
    }
    const { consumer, status } = request.body || {};

    if (!consumer || !status) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'consumer and status are required'
      });
    }

    if (!['SUCCESS', 'FAILED'].includes(status)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'status must be SUCCESS or FAILED'
      });
    }

    const nextStatus = status === 'SUCCESS' ? 'CONSUMED' : 'FAILED';
    const updated = await consumeSaleByCnpj(saleId, cnpj, consumer, nextStatus);

    if (!updated) {
      return reply.status(404).send({ error: 'Not Found', message: 'Sale not found' });
    }

    if (updated.status === 'CONSUMED') {
      fireSaleConsumedWebhook(updated, request.log);
    }

    return reply.send({
      id: updated.sale_id,
      status: updated.status,
      consumed_at: updated.consumed_at
    });
  } catch (error) {
    request.log.error({ error: error.message, stack: error.stack }, 'Error consuming sale');
    await persistErrorLog({
      source: 'api_request',
      event: 'consume_sale.error',
      severity: 'ERROR',
      cnpj: request.params?.cnpj || request.query?.cnpj || null,
      errorMessage: error.message,
      errorCode: error.code || null,
      errorContext: { stack: error.stack ? String(error.stack).slice(0, 4000) : null },
      requestPath: request.url,
      requestMethod: request.method,
      httpStatus: 500,
    });
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
