-- Migration: Create sales table
-- Generated: 2026-01-27

CREATE TABLE IF NOT EXISTS sales (
  sale_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id INTEGER NOT NULL REFERENCES "Pharmacy"(id) ON DELETE CASCADE,
  cnpj VARCHAR(20) NOT NULL,
  codigo_venda_online TEXT NOT NULL,
  data_venda TIMESTAMPTZ,
  nome_cliente TEXT,
  tipo_ecommerce TEXT,
  entrega JSONB,
  produtos JSONB,
  pagamentos JSONB,
  raw_json JSONB NOT NULL,
  idempotency_key TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_sale_reference UNIQUE (pharmacy_id, codigo_venda_online, tipo_ecommerce)
);

-- Partial unique index for idempotency when provided
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idempotency
  ON sales (pharmacy_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_pharmacy ON sales (pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_codigo ON sales (codigo_venda_online);
