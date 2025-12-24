-- Migration 004: Add unique constraint for product natural key
-- Ensures ON CONFLICT works correctly for upsert operations

-- Drop existing index if it exists (from previous attempts)
DROP INDEX IF EXISTS product_natural_key_idx;

-- Add unique constraint on the natural key
-- This allows ON CONFLICT to work properly
ALTER TABLE "Product" 
ADD CONSTRAINT IF NOT EXISTS product_natural_key_unique 
UNIQUE ("pharmacyId", "productId", title);

-- Verify constraint was created
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = '"Product"'::regclass 
  AND conname = 'product_natural_key_unique';
