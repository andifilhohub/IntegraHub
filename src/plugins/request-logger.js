import { persistRequestLog } from '../db/request-log.js';

// Headers whose values are redacted before storage
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'x-inova-api-key',
  'apikey',
  'api-key',
  'inova-api-key',
  'x-admin-api-key',
  'cookie',
  'set-cookie',
]);

function sanitizeHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? '[REDACTED]' : v;
  }
  return out;
}

function getClientIp(request) {
  const fwd = request.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers['x-real-ip'] || request.ip || null;
}

// Called directly on the root Fastify instance (not via fastify.register)
// so the hooks apply to every route, not just an encapsulated child scope.
export function registerRequestLogger(fastify) {
  fastify.addHook('onRequest', async (request) => {
    request._reqStartTime = Date.now();
  });

  fastify.addHook('onSend', async (request, reply, payload) => {
    // Skip health check (too noisy) and the log-query endpoints themselves
    const url = request.url || '';
    if (url === '/health' || url.startsWith('/admin/logs')) {
      return payload;
    }

    const latencyMs = Date.now() - (request._reqStartTime || Date.now());
    const statusCode = reply.statusCode;

    let resBody = null;
    let resSize = 0;
    if (typeof payload === 'string') {
      resSize = Buffer.byteLength(payload, 'utf8');
      if (resSize <= 10240) {
        try { resBody = JSON.parse(payload); } catch {}
      }
    }

    const pharmacy = request._pharmacy;

    persistRequestLog({
      requestId: request.id,
      method: request.method,
      path: url.split('?')[0],
      route: request.routeOptions?.url || request.routerPath || url.split('?')[0],
      queryParams: request.query || {},
      reqHeaders: sanitizeHeaders(request.headers),
      reqBodySize: request.headers['content-length']
        ? parseInt(request.headers['content-length'])
        : null,
      ip: getClientIp(request),
      userAgent: request.headers['user-agent'] || null,
      pharmacyId: pharmacy?.id || null,
      cnpj: pharmacy?.cnpj || null,
      statusCode,
      resBody,
      resSize,
      latencyMs,
      errorMessage: request._reqError || null,
    }).catch(() => {});

    return payload;
  });
}
