-- Create product_variants table and add variant_id to purchase_items & sale_items
BEGIN;

CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  mrp NUMERIC(12,2),
  price NUMERIC(12,2) DEFAULT 0,
  unit VARCHAR(10),
  tax_percent NUMERIC(6,2) DEFAULT 0,
  stock NUMERIC(12,2) DEFAULT 0,
  barcode VARCHAR(100),
  created_at TIMESTAMP DEFAULT now()
);

-- Unique per-product variant by MRP (allow NULLs; index supports distinctness)
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_product_mrp ON product_variants (product_id, mrp);

-- Add variant_id columns to purchase_items and sale_items for backward compat
ALTER TABLE IF EXISTS purchase_items ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id);
ALTER TABLE IF EXISTS sale_items ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id);

COMMIT;
