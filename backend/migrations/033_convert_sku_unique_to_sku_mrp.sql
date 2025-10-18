-- Convert unique SKU constraint to unique (store_id, lower(sku), mrp)
BEGIN;
ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_sku_key;
-- Create unique index on (store_id, lower(sku), mrp) to allow same SKU with different MRP per store
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_store_sku_mrp ON products (store_id, lower(sku), mrp);
COMMIT;
