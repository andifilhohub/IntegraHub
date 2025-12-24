-- Migration: Create batch_chunks table
-- Generated: 2025-12-23

CREATE TABLE IF NOT EXISTS batch_chunks (
  chunk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(batch_id) ON DELETE CASCADE,
  chunk_uri TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' 
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  items_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  
  CONSTRAINT unique_batch_chunk_index UNIQUE (batch_id, chunk_index)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_batch_chunks_batch ON batch_chunks (batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_chunks_status ON batch_chunks (status);
CREATE INDEX IF NOT EXISTS idx_batch_chunks_processing ON batch_chunks (batch_id, status) 
  WHERE status IN ('PENDING', 'PROCESSING');
