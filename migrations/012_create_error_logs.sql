-- Migration: Create error_logs table for persisting failures
-- Generated: 2026-04-29

CREATE TABLE IF NOT EXISTS error_logs (
  id              BIGSERIAL PRIMARY KEY,

  -- Origin of the error
  source          VARCHAR(50)  NOT NULL, -- 'api_request', 'chunker', 'upsert'
  event           VARCHAR(100),          -- e.g. 'ingest_products.error', 'chunker.retry', 'upsert.failed'
  severity        VARCHAR(10)  NOT NULL DEFAULT 'ERROR', -- 'WARN', 'ERROR', 'FATAL'

  -- Business context
  pharmacy_id     INTEGER REFERENCES "Pharmacy"(id) ON DELETE SET NULL,
  cnpj            VARCHAR(20),
  batch_id        UUID REFERENCES batches(batch_id) ON DELETE SET NULL,
  chunk_id        UUID REFERENCES batch_chunks(chunk_id) ON DELETE SET NULL,

  -- Error details
  error_message   TEXT,
  error_code      VARCHAR(100),
  error_context   JSONB,

  -- HTTP request context (populated only for api_request source)
  request_path    VARCHAR(500),
  request_method  VARCHAR(10),
  http_status     INTEGER,

  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_occurred_at
  ON error_logs (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_source_occurred
  ON error_logs (source, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_cnpj
  ON error_logs (cnpj, occurred_at DESC)
  WHERE cnpj IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_batch_id
  ON error_logs (batch_id)
  WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_chunk_id
  ON error_logs (chunk_id)
  WHERE chunk_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_severity
  ON error_logs (severity, occurred_at DESC);
