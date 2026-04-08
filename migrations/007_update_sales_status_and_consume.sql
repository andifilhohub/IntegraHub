-- Migration: Update sales status values and add consumed_at
-- Generated: 2026-01-27

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consumed_by TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_status_check'
  ) THEN
    ALTER TABLE sales DROP CONSTRAINT sales_status_check;
  END IF;
END $$;

ALTER TABLE sales
  ADD CONSTRAINT sales_status_check
  CHECK (status IN ('RECEIVED', 'PROCESSING', 'PENDING', 'COMPLETED', 'CONSUMED', 'FAILED'));
