import crypto from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { findPharmacyByCnpj, setPharmacyApiKey, upsertPharmacy } from '../db/queries.js';
import { queryRequestLogs, getRequestLogById } from '../db/request-log.js';
import pool from '../db/pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const monitorHtml = readFileSync(join(__dirname, '../public/monitor.html'), 'utf8');

function normalizeCnpj(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\D/g, '');
}

function adminAuthenticate(request) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return false;

  const raw = request.headers['authorization'] || request.headers['x-admin-api-key'];
  if (!raw) return false;

  const token = raw.replace(/^Bearer\s+/i, '').trim();
  return token === adminKey;
}

/**
 * POST /admin/pharmacies/:cnpj/api-key
 *
 * Generates (or sets) an API key for a pharmacy.
 * Creates the pharmacy if it doesn't exist.
 *
 * Optional body: { "key": "custom-key" }
 *   — Pass a custom key for controlled key rotation
 *   — Omit to auto-generate a cryptographically random key.
 *
 * Requires header:  Authorization: Bearer <ADMIN_API_KEY>
 *                   or X-Admin-Api-Key: <ADMIN_API_KEY>
 */
export async function generatePharmacyApiKeyHandler(request, reply) {
  if (!adminAuthenticate(request)) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Valid admin API key required. Use Authorization: Bearer <ADMIN_API_KEY> or X-Admin-Api-Key: <key>'
    });
  }

  const rawCnpj =
    request.params?.cnpj ||
    request.body?.cnpj ||
    request.query?.cnpj;

  const cnpj = normalizeCnpj(rawCnpj);
  if (!cnpj) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'cnpj is required (param, query, or body)'
    });
  }

  // Criar farmácia se não existir
  const pharmacy = await upsertPharmacy({
    cnpj,
    name: `Farmácia ${cnpj}`,
    state: null,
    city: null,
    rawJson: {}
  });

  const { key: customKey } = request.body || {};
  const newKey = customKey?.trim() || crypto.randomBytes(32).toString('hex');

  const updated = await setPharmacyApiKey(cnpj, newKey);

  return reply.status(200).send({
    cnpj: updated.cnpj,
    name: updated.name,
    api_key: newKey,
    message: 'API key set successfully. Store it securely — it will not be shown again.'
  });
}

/**
 * GET /admin/logs
 *
 * Paginated history of all request logs.
 *
 * Query params:
 *   limit        number  (default 50, max 200)
 *   offset       number  (default 0)
 *   status_code  number  exact match
 *   method       string  GET | POST | ...
 *   path         string  partial match (ILIKE)
 *   cnpj         string  exact match
 *   date_from    ISO8601 occurred_at >=
 *   date_to      ISO8601 occurred_at <=
 */
export async function requestLogsHandler(request, reply) {
  if (!adminAuthenticate(request)) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const {
    limit,
    offset,
    status_code,
    method,
    path,
    cnpj,
    date_from,
    date_to,
  } = request.query;

  const result = await queryRequestLogs({
    limit: Math.min(parseInt(limit) || 50, 200),
    offset: parseInt(offset) || 0,
    statusCode: status_code,
    method,
    path,
    cnpj,
    dateFrom: date_from,
    dateTo: date_to,
  });

  return reply.send(result);
}

/**
 * GET /admin/logs/:id
 *
 * Full detail of a single request log entry including headers, body, etc.
 */
export async function requestLogByIdHandler(request, reply) {
  if (!adminAuthenticate(request)) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const id = parseInt(request.params.id);
  if (!id || isNaN(id)) {
    return reply.status(400).send({ error: 'Invalid id' });
  }

  const log = await getRequestLogById(id);
  if (!log) {
    return reply.status(404).send({ error: 'Not found' });
  }

  return reply.send(log);
}

/**
 * GET /admin/logs/stream
 *
 * Server-Sent Events stream. Emits one JSON event per incoming request
 * in real time, pushed by PostgreSQL LISTEN/NOTIFY.
 *
 * The SSE payload matches the compact trigger JSON:
 *   { id, request_id, method, path, route, ip, cnpj,
 *     status_code, latency_ms, res_size, error_message, occurred_at }
 *
 * Connect with:
 *   const es = new EventSource('/admin/logs/stream', { headers: { 'x-admin-api-key': KEY } })
 *   es.onmessage = e => console.log(JSON.parse(e.data))
 */
export async function requestLogsStreamHandler(request, reply) {
  if (!adminAuthenticate(request)) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  // Take control of the raw socket — Fastify won't attempt its own reply
  reply.hijack();

  reply.raw.writeHead(200, {
    'Content-Type':  'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering
  });

  // SSE spec: tell clients to reconnect after 3 s on drop
  reply.raw.write('retry: 3000\n\n');

  // Dedicated pg client for LISTEN (must not share with query pool)
  const pgClient = await pool.connect();
  await pgClient.query('LISTEN request_log_inserted');

  const onNotify = (msg) => {
    if (!reply.raw.writableEnded) {
      reply.raw.write(`data: ${msg.payload}\n\n`);
    }
  };

  pgClient.on('notification', onNotify);

  // Keep-alive heartbeat — proxies and load balancers drop idle SSE connections
  const heartbeat = setInterval(() => {
    if (!reply.raw.writableEnded) {
      reply.raw.write(': ping\n\n');
    }
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    pgClient.off('notification', onNotify);
    pgClient.query('UNLISTEN request_log_inserted').catch(() => {});
    pgClient.release();
  };

  request.raw.on('close', cleanup);
  request.raw.on('error', cleanup);

  // Hold the handler open until the client disconnects
  await new Promise((resolve) => {
    request.raw.on('close', resolve);
    request.raw.on('error', resolve);
  });
}

/**
 * GET /admin/monitor
 *
 * Serves the real-time request monitor dashboard (single-page HTML app).
 * No authentication required to load the page — auth is handled client-side
 * via the Admin API Key input, which is then used for all API calls.
 */
export async function monitorPageHandler(request, reply) {
  return reply.type('text/html; charset=utf-8').send(monitorHtml);
}
