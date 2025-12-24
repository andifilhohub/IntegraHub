-- Migration: Add missing fields to Product table
-- Generated: 2025-12-23

ALTER TABLE "Product" 
  ADD COLUMN IF NOT EXISTS "shopId" INTEGER,
  ADD COLUMN IF NOT EXISTS "pricePromo" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "wholesalePrice" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "wholesaleMin" INTEGER,
  ADD COLUMN IF NOT EXISTS "measure" INTEGER,
  ADD COLUMN IF NOT EXISTS "size" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "color" TEXT,
  ADD COLUMN IF NOT EXISTS "indice" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastBatchId" TEXT;

-- Create index for faster lookups by natural key
CREATE INDEX IF NOT EXISTS "idx_product_natural_key" 
  ON "Product" ("pharmacyId", "productId", "title");

-- Create index for CNPJ lookups via Pharmacy
CREATE INDEX IF NOT EXISTS "idx_product_pharmacy" 
  ON "Product" ("pharmacyId");

-- Create index for active products
CREATE INDEX IF NOT EXISTS "idx_product_active" 
  ON "Product" ("isActive") 
  WHERE "isActive" = true;
