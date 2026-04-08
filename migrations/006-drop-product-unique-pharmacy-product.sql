-- Migration 006: Drop legacy unique index on (pharmacyId, productId)
-- This index blocks multiple promotions per product.

DROP INDEX IF EXISTS "Product_pharmacyId_productId_key";
