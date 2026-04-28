ALTER TABLE "Pharmacy"
  ADD COLUMN IF NOT EXISTS "apiKey" TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS "idx_pharmacy_api_key"
  ON "Pharmacy" ("apiKey")
  WHERE "apiKey" IS NOT NULL;
