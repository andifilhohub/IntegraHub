import { query } from './pool.js';
import logger from '../utils/logger.js';

export async function persistRequestLog({
  requestId,
  method,
  path,
  route,
  queryParams,
  reqHeaders,
  reqBodySize,
  ip,
  userAgent,
  pharmacyId,
  cnpj,
  statusCode,
  resBody,
  resSize,
  latencyMs,
  errorMessage,
}) {
  try {
    await query(
      `INSERT INTO request_logs (
        request_id, method, path, route,
        query_params, req_headers, req_body_size,
        ip, user_agent,
        pharmacy_id, cnpj,
        status_code, res_body, res_size,
        latency_ms, error_message
      ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16)`,
      [
        requestId || null,
        method?.slice(0, 10),
        path?.slice(0, 500),
        route?.slice(0, 500) || null,
        queryParams && Object.keys(queryParams).length ? JSON.stringify(queryParams) : null,
        reqHeaders ? JSON.stringify(reqHeaders) : null,
        reqBodySize || null,
        ip?.slice(0, 100) || null,
        userAgent?.slice(0, 500) || null,
        pharmacyId || null,
        cnpj ? String(cnpj).slice(0, 20) : null,
        statusCode || null,
        resBody ? JSON.stringify(resBody) : null,
        resSize || null,
        latencyMs || null,
        errorMessage ? String(errorMessage).slice(0, 1000) : null,
      ]
    );
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to persist request log');
  }
}

export async function queryRequestLogs({
  limit = 50,
  offset = 0,
  statusCode,
  method,
  path,
  cnpj,
  dateFrom,
  dateTo,
} = {}) {
  const conditions = [];
  const params = [];

  if (statusCode) {
    params.push(parseInt(statusCode));
    conditions.push(`status_code = $${params.length}`);
  }
  if (method) {
    params.push(method.toUpperCase());
    conditions.push(`method = $${params.length}`);
  }
  if (path) {
    params.push(`%${path}%`);
    conditions.push(`path ILIKE $${params.length}`);
  }
  if (cnpj) {
    params.push(cnpj);
    conditions.push(`cnpj = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`occurred_at >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    conditions.push(`occurred_at <= $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countParams = [...params];

  params.push(limit);
  params.push(offset);

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT
         id, request_id, method, path, route,
         ip, user_agent, cnpj,
         status_code, latency_ms,
         req_body_size, res_size, error_message,
         occurred_at
       FROM request_logs
       ${where}
       ORDER BY occurred_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    query(
      `SELECT COUNT(*) AS total FROM request_logs ${where}`,
      countParams
    ),
  ]);

  return {
    logs: dataResult.rows,
    total: parseInt(countResult.rows[0].total, 10),
  };
}

export async function getRequestLogById(id) {
  const result = await query(
    `SELECT * FROM request_logs WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}
