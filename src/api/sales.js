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
import crypto from 'crypto';

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

const authenticate = (request) => {
  const authHeader = request.headers.authorization || request.headers['x-api-key'] || request.headers['x-inova-api-key'];
  const validApiKeys = (process.env.VALID_API_KEYS || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);

  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  return validApiKeys.includes(token);
};

export async function ingestSale(request, reply) {
  try {
    if (!authenticate(request)) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Valid API key required. Use Authorization: Bearer {token} or X-Api-Key: {token}'
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
      const hash = crypto.createHash('md5').update(payloadBuffer).digest('hex').substring(0, 8);
      idempotencyKey = `auto-${cnpjEmpresa}-${Date.now()}-${hash}`;
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
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export async function listPendingSalesHandler(request, reply) {
  try {
    if (!authenticate(request)) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Valid API key required. Use Authorization: Bearer {token} or X-Api-Key: {token}'
      });
    }

    const cnpj = normalizeString(request.params.cnpj || request.query.cnpj);
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
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export async function getSaleByIdHandler(request, reply) {
  try {
    if (!authenticate(request)) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Valid API key required. Use Authorization: Bearer {token} or X-Api-Key: {token}'
      });
    }

    const saleId = request.params.id;
    const cnpj = normalizeString(request.params.cnpj || request.query.cnpj);
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

    return reply.send(payload || {});
  } catch (error) {
    request.log.error({ error: error.message, stack: error.stack }, 'Error fetching sale by id');
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export async function listConsumedSalesHandler(request, reply) {
  try {
    if (!authenticate(request)) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Valid API key required. Use Authorization: Bearer {token} or X-Api-Key: {token}'
      });
    }

    const cnpj = normalizeString(request.params.cnpj || request.query.cnpj);
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
        consumed_at: row.consumed_at,
        consumed_by: row.consumed_by,
        created_at: row.created_at,
      })),
    });
  } catch (error) {
    request.log.error({ error: error.message, stack: error.stack }, 'Error listing consumed sales');
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export async function consumeSaleHandler(request, reply) {
  try {
    if (!authenticate(request)) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Valid API key required. Use Authorization: Bearer {token} or X-Api-Key: {token}'
      });
    }

    const saleId = request.params.id;
    const cnpj = normalizeString(request.params.cnpj || request.query.cnpj);
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
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
