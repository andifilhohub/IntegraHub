-- Migration: Full request telemetry log table
-- Every HTTP request is recorded here (except /health and /admin/logs queries)

CREATE TABLE IF NOT EXISTS request_logs (
  id              BIGSERIAL PRIMARY KEY,

  request_id      VARCHAR(100),
  method          VARCHAR(10)   NOT NULL,
  path            VARCHAR(500)  NOT NULL,
  route           VARCHAR(500),              -- matched route pattern (e.g. /api/v1/sales/:cnpj/:id)
  query_params    JSONB,
  req_headers     JSONB,                     -- all headers, API key values redacted
  req_body_size   INTEGER,                   -- Content-Length bytes (no body stored for large payloads)
  ip              VARCHAR(100),
  user_agent      VARCHAR(500),

  -- Authenticated context (null for unauthenticated requests)
  pharmacy_id     INTEGER REFERENCES "Pharmacy"(id) ON DELETE SET NULL,
  cnpj            VARCHAR(20),

  -- Response
  status_code     INTEGER,
  res_body        JSONB,                     -- response JSON if <= 10 KB
  res_size        INTEGER,                   -- response bytes
  latency_ms      INTEGER,

  error_message   TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_logs_occurred_at
  ON request_logs (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_request_logs_status_code
  ON request_logs (status_code, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_request_logs_cnpj
  ON request_logs (cnpj, occurred_at DESC)
  WHERE cnpj IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_request_logs_method_path
  ON request_logs (method, path, occurred_at DESC);

-- pg_notify trigger: emits a compact JSON payload to the 'request_log_inserted' channel
-- so SSE listeners get push notifications without polling.
-- Payload is intentionally minimal to stay well under the 8000-byte pg_notify limit.
CREATE OR REPLACE FUNCTION notify_request_log()
RETURNS TRIGGER AS $$
DECLARE
  payload TEXT;
BEGIN
  payload := json_build_object(
    'id',          NEW.id,
    'request_id',  NEW.request_id,
    'method',      NEW.method,
    'path',        NEW.path,
    'route',       NEW.route,
    'ip',          NEW.ip,
    'cnpj',        NEW.cnpj,
    'status_code', NEW.status_code,
    'latency_ms',  NEW.latency_ms,
    'res_size',    NEW.res_size,
    'error_message', CASE WHEN NEW.error_message IS NOT NULL THEN left(NEW.error_message, 200) ELSE NULL END,
    'occurred_at', to_char(NEW.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )::text;
  PERFORM pg_notify('request_log_inserted', payload);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notify_request_log ON request_logs;
CREATE TRIGGER trigger_notify_request_log
  AFTER INSERT ON request_logs
  FOR EACH ROW EXECUTE FUNCTION notify_request_log();
