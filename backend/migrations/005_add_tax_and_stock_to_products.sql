-- Add tax_percent and stock columns to products
ALTER TABLE IF EXISTS products
  ADD COLUMN IF NOT EXISTS tax_percent INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;
