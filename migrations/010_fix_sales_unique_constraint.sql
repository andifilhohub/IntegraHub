-- Fix: unique_sale_reference included tipo_ecommerce which is often NULL.
-- In PostgreSQL, NULL != NULL in UNIQUE constraints, so rows with the same
-- (pharmacy_id, codigo_venda_online) but NULL tipo_ecommerce were never deduplicated.
-- This caused duplicate PENDING entries for the same sale, which downstream
-- consumers (Inova) would try to process twice, hitting their unique index.

-- Deduplicate any existing duplicates: keep the most-recently-updated row per
-- (pharmacy_id, codigo_venda_online), preferring CONSUMED > PENDING > others.
DELETE FROM sales
WHERE sale_id IN (
  SELECT sale_id FROM (
    SELECT
      sale_id,
      ROW_NUMBER() OVER (
        PARTITION BY pharmacy_id, codigo_venda_online
        ORDER BY
          CASE status WHEN 'CONSUMED' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,
          updated_at DESC
      ) AS rn
    FROM sales
  ) ranked
  WHERE rn > 1
);

-- Drop old three-column constraint
ALTER TABLE sales DROP CONSTRAINT IF EXISTS unique_sale_reference;

-- New constraint: unique per pharmacy + sale code, regardless of tipo_ecommerce
ALTER TABLE sales
  ADD CONSTRAINT unique_sale_reference UNIQUE (pharmacy_id, codigo_venda_online);
