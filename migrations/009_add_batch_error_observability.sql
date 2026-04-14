-- Migration: Add error observability fields to batches and batch_chunks
-- Generated: 2026-04-13

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_context JSONB,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

ALTER TABLE batch_chunks
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_context JSONB,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_batches_last_error_at
  ON batches (last_error_at DESC)
  WHERE last_error_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_batch_chunks_last_error_at
  ON batch_chunks (last_error_at DESC)
  WHERE last_error_at IS NOT NULL;
