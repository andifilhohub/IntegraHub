-- Migration 004: Add unique constraint for product natural key
-- Ensures ON CONFLICT works correctly for upsert operations

-- Drop existing index if it exists (from previous attempts)
DROP INDEX IF EXISTS product_natural_key_idx;

-- Add unique constraint on the natural key (idempotent way)
-- This allows ON CONFLICT to work properly
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'product_natural_key_unique' 
        AND conrelid = '"Product"'::regclass
    ) THEN
        ALTER TABLE "Product" 
        ADD CONSTRAINT product_natural_key_unique 
        UNIQUE ("pharmacyId", "productId", title);
    END IF;
END $$;

-- Verify constraint was created
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = '"Product"'::regclass 
  AND conname = 'product_natural_key_unique';
