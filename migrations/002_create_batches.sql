-- Migration: Create batches table
-- Generated: 2025-12-23

CREATE TABLE IF NOT EXISTS batches (
  batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id INTEGER NOT NULL REFERENCES "Pharmacy"(id) ON DELETE CASCADE,
  load_type VARCHAR(10) NOT NULL CHECK (load_type IN ('delta', 'full')),
  idempotency_key TEXT NOT NULL,
  payload_uri TEXT NOT NULL,
  payload_checksum TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED' 
    CHECK (status IN ('RECEIVED', 'PROCESSING', 'COMPLETED', 'PARTIAL_FAIL', 'FAILED')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  items_total INTEGER DEFAULT 0,
  items_processed INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_pharmacy_idempotency UNIQUE (pharmacy_id, idempotency_key)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_batches_pharmacy ON batches (pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches (status);
CREATE INDEX IF NOT EXISTS idx_batches_created ON batches (created_at DESC);
