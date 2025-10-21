-- 036_add_product_variants_jsonb.sql
-- Add a JSONB `variants` column to `products`, populate from existing product_variants table
-- and expose a view + helper functions for safe updates.

BEGIN;

-- Add the column if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products' AND column_name='variants'
  ) THEN
    ALTER TABLE products ADD COLUMN variants jsonb DEFAULT '{}'::jsonb;
  END IF;
END$$;

-- If a normalized product_variants table exists, aggregate its rows into the products.variants JSONB
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='product_variants') THEN
    WITH agg AS (
      SELECT product_id, jsonb_object_agg(mrp::text, stock::int) AS vs
      FROM product_variants
      GROUP BY product_id
    )
    UPDATE products p
    SET variants = COALESCE(p.variants, '{}'::jsonb) || agg.vs
    FROM agg
    WHERE p.id = agg.product_id;
  END IF;
END$$;

-- Create a view that expands JSONB into rows (useful for POS and reporting)
CREATE OR REPLACE VIEW product_variants_json AS
SELECT
  p.id AS product_id,
  p.sku,
  p.name,
  (kv.key)::text AS mrp_text,
  (kv.value)::numeric AS stock
FROM products p,
LATERAL jsonb_each(p.variants) AS kv(key, value);

-- Helper function to atomically adjust a variant quantity (can be positive or negative).
-- Returns the new quantity after adjustment.
CREATE OR REPLACE FUNCTION variants_adjust(p_id int, p_mrp text, delta int)
RETURNS int AS $$
DECLARE
  cur_qty int;
  new_qty int;
BEGIN
  -- Lock the row to serialize concurrent adjustments
  SELECT (variants->>p_mrp)::int INTO cur_qty FROM products WHERE id = p_id FOR UPDATE;

  IF cur_qty IS NULL THEN
    -- if not present and delta is positive, create entry
    IF delta > 0 THEN
      UPDATE products
      SET variants = COALESCE(variants, '{}'::jsonb) || jsonb_build_object(p_mrp, delta)
      WHERE id = p_id
      RETURNING (variants->>p_mrp)::int INTO new_qty;
      RETURN new_qty;
    ELSE
      -- trying to decrement a non-existent variant
      RAISE EXCEPTION 'Variant % not found for product %', p_mrp, p_id;
    END IF;
  ELSE
    new_qty := cur_qty + delta;
    IF new_qty < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product % mrp %: have %, need %', p_id, p_mrp, cur_qty, -delta;
    END IF;
    UPDATE products
    SET variants = jsonb_set(variants, ARRAY[p_mrp], to_jsonb(new_qty), true)
    WHERE id = p_id
    RETURNING (variants->>p_mrp)::int INTO new_qty;
    RETURN new_qty;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- Notes:
-- 1. Use `SELECT * FROM product_variants_json WHERE sku = 'ABC'` to list MRP rows for POS.
-- 2. Use `SELECT variants_adjust($1, $2, $3)` to atomically change a variant's stock.
-- 3. You may remove the normalized `product_variants` table after you confirm behavior, but keep backups.
-- 4. For high-throughput use, prefer single-statement UPDATE patterns where possible; the function uses row locking to be safe.
