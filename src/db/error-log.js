import { query } from './pool.js';
import logger from '../utils/logger.js';

/**
 * Persists an error/failure event to the error_logs table.
 * Fire-and-forget safe: internal errors are swallowed so this never
 * interrupts the calling code path.
 *
 * @param {object} opts
 * @param {'api_request'|'chunker'|'upsert'} opts.source
 * @param {string}  [opts.event]         - e.g. 'chunker.retry', 'ingest_products.error'
 * @param {'WARN'|'ERROR'|'FATAL'} [opts.severity]  - default 'ERROR'
 * @param {string}  [opts.pharmacyId]
 * @param {string}  [opts.cnpj]
 * @param {string}  [opts.batchId]
 * @param {string}  [opts.chunkId]
 * @param {string}  [opts.errorMessage]
 * @param {string}  [opts.errorCode]
 * @param {object}  [opts.errorContext]
 * @param {string}  [opts.requestPath]
 * @param {string}  [opts.requestMethod]
 * @param {number}  [opts.httpStatus]
 */
export async function persistErrorLog({
  source,
  event = null,
  severity = 'ERROR',
  pharmacyId = null,
  cnpj = null,
  batchId = null,
  chunkId = null,
  errorMessage = null,
  errorCode = null,
  errorContext = null,
  requestPath = null,
  requestMethod = null,
  httpStatus = null,
}) {
  try {
    await query(
      `INSERT INTO error_logs (
        source, event, severity,
        pharmacy_id, cnpj, batch_id, chunk_id,
        error_message, error_code, error_context,
        request_path, request_method, http_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`,
      [
        source,
        event,
        severity,
        pharmacyId || null,
        cnpj ? String(cnpj).slice(0, 20) : null,
        batchId || null,
        chunkId || null,
        errorMessage ? String(errorMessage).slice(0, 2000) : null,
        errorCode ? String(errorCode).slice(0, 100) : null,
        errorContext ? JSON.stringify(errorContext) : null,
        requestPath ? String(requestPath).slice(0, 500) : null,
        requestMethod ? String(requestMethod).slice(0, 10) : null,
        httpStatus || null,
      ]
    );
  } catch (err) {
    // Never let error logging crash the application
    logger.warn({ err: err.message }, 'Failed to persist error log to DB');
  }
}
