import { query } from '../db/pool.js';

export async function findPharmacyByCnpj(cnpj) {
  const result = await query(
    'SELECT id, cnpj, name FROM "Pharmacy" WHERE cnpj = $1 LIMIT 1',
    [cnpj]
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
