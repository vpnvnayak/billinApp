-- Add mrp and variant_id to sale_items so new sales can persist variant snapshot data
BEGIN;

ALTER TABLE IF EXISTS sale_items ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id);
ALTER TABLE IF EXISTS sale_items ADD COLUMN IF NOT EXISTS mrp NUMERIC(12,2);

COMMIT;
