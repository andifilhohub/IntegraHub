-- Migration 008: Consolidate product promotions into pricePromos array
-- Replaces the (pharmacyId, productId, pricePromo) unique key with (pharmacyId, productId).
-- Promotional prices are now stored as an array in pricePromos, replacing one-row-per-promo.

-- 1. Add pricePromos array column
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "pricePromos" DOUBLE PRECISION[] DEFAULT '{}';

-- 2. Populate pricePromos from existing rows grouped by (pharmacyId, productId)
UPDATE "Product" p
SET "pricePromos" = sub.promos
FROM (
  SELECT "pharmacyId", "productId",
         array_agg("pricePromo" ORDER BY "pricePromo") FILTER (WHERE "pricePromo" IS NOT NULL) AS promos
  FROM "Product"
  GROUP BY "pharmacyId", "productId"
) sub
WHERE p."pharmacyId" = sub."pharmacyId"
  AND p."productId" = sub."productId";

-- 3. Delete duplicate rows, keeping the most recently updated row per product
DELETE FROM "Product"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY "pharmacyId", "productId"
             ORDER BY "updatedAt" DESC, id DESC
           ) AS rn
    FROM "Product"
  ) ranked
  WHERE rn > 1
);

-- 4. Drop old constraints
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS product_natural_key_unique_v2;
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS product_natural_key_unique;

-- 5. Add new unique constraint on (pharmacyId, productId) only
ALTER TABLE "Product"
ADD CONSTRAINT "product_pharmacy_product_unique"
UNIQUE ("pharmacyId", "productId");
