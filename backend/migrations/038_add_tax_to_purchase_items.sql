-- Add tax and related columns to purchase_items so per-line tax is persisted
ALTER TABLE IF EXISTS purchase_items
  ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cess_pct NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit VARCHAR(64),
  ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(14,2);
