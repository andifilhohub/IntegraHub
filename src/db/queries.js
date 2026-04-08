import { query } from '../db/pool.js';

export async function findPharmacyByCnpj(cnpj) {
  const result = await query(
    'SELECT id, cnpj, name FROM "Pharmacy" WHERE cnpj = $1 LIMIT 1',
    [cnpj]
  );
  return result.rows[0];
}

export async function upsertPharmacy({ cnpj, name, state, city, rawJson }) {
  const result = await query(
    `INSERT INTO "Pharmacy" (cnpj, name, state, city, "rawJson", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())
     ON CONFLICT (cnpj) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, "Pharmacy".name),
       state = COALESCE(EXCLUDED.state, "Pharmacy".state),
       city = COALESCE(EXCLUDED.city, "Pharmacy".city),
       "rawJson" = COALESCE(EXCLUDED."rawJson", "Pharmacy"."rawJson"),
       "updatedAt" = NOW()
     RETURNING id, cnpj, name, state, city`,
    [cnpj, name, state, city, JSON.stringify(rawJson || {})]
  );

  return result.rows[0];
}

export async function createBatch(pharmacyId, loadType, idempotencyKey, payloadUri, checksum, itemsTotal) {
  const result = await query(
    `INSERT INTO batches 
      (pharmacy_id, load_type, idempotency_key, payload_uri, payload_checksum, items_total, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'RECEIVED')
    ON CONFLICT (pharmacy_id, idempotency_key) 
    DO UPDATE SET updated_at = NOW()
    RETURNING batch_id, status, created_at`,
    [pharmacyId, loadType, idempotencyKey, payloadUri, checksum, itemsTotal]
  );
  return result.rows[0];
}

export async function getBatchByIdempotencyKey(pharmacyId, idempotencyKey) {
  const result = await query(
    `SELECT batch_id, status, created_at 
     FROM batches 
     WHERE pharmacy_id = $1 AND idempotency_key = $2`,
    [pharmacyId, idempotencyKey]
  );
  return result.rows[0];
}

export async function createSale({
  pharmacyId,
  cnpj,
  codigoVendaOnLine,
  dataVenda,
  nomeCliente,
  tipoDeEcommerce,
  entrega,
  produtos,
  pagamentos,
  rawJson,
  idempotencyKey,
  payloadUri,
  payloadChecksum,
  payloadSize
}) {
  const result = await query(
    `INSERT INTO sales (
      pharmacy_id,
      cnpj,
      codigo_venda_online,
      data_venda,
      nome_cliente,
      tipo_ecommerce,
      entrega,
      produtos,
      pagamentos,
      raw_json,
      idempotency_key,
      payload_uri,
      payload_checksum,
      payload_size
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13, $14
    )
    ON CONFLICT (pharmacy_id, codigo_venda_online, tipo_ecommerce)
    DO UPDATE SET
      data_venda = EXCLUDED.data_venda,
      nome_cliente = EXCLUDED.nome_cliente,
      entrega = EXCLUDED.entrega,
      produtos = EXCLUDED.produtos,
      pagamentos = EXCLUDED.pagamentos,
      raw_json = COALESCE(EXCLUDED.raw_json, sales.raw_json),
      idempotency_key = COALESCE(EXCLUDED.idempotency_key, sales.idempotency_key),
      payload_uri = COALESCE(EXCLUDED.payload_uri, sales.payload_uri),
      payload_checksum = COALESCE(EXCLUDED.payload_checksum, sales.payload_checksum),
      payload_size = COALESCE(EXCLUDED.payload_size, sales.payload_size),
      updated_at = NOW()
    RETURNING sale_id, status, created_at`,
    [
      pharmacyId,
      cnpj,
      codigoVendaOnLine,
      dataVenda,
      nomeCliente,
      tipoDeEcommerce,
      JSON.stringify(entrega || {}),
      JSON.stringify(produtos || []),
      JSON.stringify(pagamentos || []),
      rawJson ? JSON.stringify(rawJson) : null,
      idempotencyKey || null,
      payloadUri || null,
      payloadChecksum || null,
      payloadSize || null
    ]
  );
  return result.rows[0];
}

export async function getSaleByIdempotencyKey(pharmacyId, idempotencyKey) {
  const result = await query(
    `SELECT sale_id, status, created_at 
     FROM sales 
     WHERE pharmacy_id = $1 AND idempotency_key = $2`,
    [pharmacyId, idempotencyKey]
  );
  return result.rows[0];
}

export async function listPendingSalesByCnpj(cnpj, limit = 100) {
  const result = await query(
    `SELECT sale_id, created_at
     FROM sales
     WHERE status = 'PENDING' AND cnpj = $1
     ORDER BY created_at
     LIMIT $2`,
    [cnpj, limit]
  );
  return result.rows;
}

export async function getSaleByIdAndCnpj(saleId, cnpj) {
  const result = await query(
    `SELECT sale_id, status, raw_json, payload_uri, created_at
     FROM sales
     WHERE sale_id = $1 AND cnpj = $2`,
    [saleId, cnpj]
  );
  return result.rows[0];
}

export async function listConsumedSalesByCnpj(cnpj, { dateFrom, dateTo, limit = 100, offset = 0 } = {}) {
  const params = [cnpj];
  const conditions = [`status = 'CONSUMED'`, `cnpj = $1`];

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`data_venda >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    conditions.push(`data_venda <= $${params.length}`);
  }

  const where = conditions.join(' AND ');

  params.push(limit);
  params.push(offset);

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT
        sale_id,
        codigo_venda_online,
        data_venda,
        nome_cliente,
        tipo_ecommerce,
        produtos,
        pagamentos,
        consumed_at,
        consumed_by,
        created_at
       FROM sales
       WHERE ${where}
       ORDER BY consumed_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    query(
      `SELECT COUNT(*) AS total FROM sales WHERE ${where}`,
      params.slice(0, params.length - 2)
    ),
  ]);

  return {
    sales: dataResult.rows,
    total: parseInt(countResult.rows[0].total, 10),
  };
}

export async function consumeSaleByCnpj(saleId, cnpj, consumer, status) {
  const result = await query(
    `UPDATE sales
     SET status = $1,
         consumed_by = $2,
         consumed_at = NOW(),
         updated_at = NOW()
     WHERE sale_id = $3 AND cnpj = $4
     RETURNING sale_id, status, consumed_at, consumed_by, codigo_venda_online`,
    [status, consumer, saleId, cnpj]
  );
  return result.rows[0];
}
