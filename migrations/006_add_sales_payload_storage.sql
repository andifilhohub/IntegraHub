-- Migration: Add payload storage fields to sales
-- Generated: 2026-01-27

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS payload_uri TEXT,
  ADD COLUMN IF NOT EXISTS payload_checksum TEXT,
  ADD COLUMN IF NOT EXISTS payload_size INTEGER;

ALTER TABLE sales
  ALTER COLUMN raw_json DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_payload_uri ON sales (payload_uri);
