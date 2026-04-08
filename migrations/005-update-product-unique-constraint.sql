-- Migration 005: Update unique constraint for product+promo natural key
-- Allows multiple promotions per product (distinguished by pricePromo)

-- Drop previous constraint if it exists
ALTER TABLE "Product"
DROP CONSTRAINT IF EXISTS product_natural_key_unique;

-- Add new unique constraint on (pharmacyId, productId, pricePromo)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'product_natural_key_unique_v2' 
        AND conrelid = '"Product"'::regclass
    ) THEN
        ALTER TABLE "Product" 
        ADD CONSTRAINT product_natural_key_unique_v2 
        UNIQUE ("pharmacyId", "productId", "pricePromo");
    END IF;
END $$;

-- Verify constraint was created
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = '"Product"'::regclass 
  AND conname = 'product_natural_key_unique_v2';
