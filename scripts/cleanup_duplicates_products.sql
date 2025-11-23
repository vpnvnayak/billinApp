-- cleanup_duplicates_products.sql
-- Safe deduplication for `products` table by SKU (case-insensitive) and MRP grouping.
-- IMPORTANT: Review & run on a copied/staging DB first. Take a full database backup before running!
-- Usage (postgres):
--   psql "postgres://user:pass@host:port/dbname" -f cleanup_duplicates_products.sql

-- This script does the following (best-effort):
-- 1. Creates backup copies of `products` and `product_variants` into tables with timestamp suffix.
-- 2. Finds groups of products with the same LOWER(sku) and the same mrp (coalesced to text), where count > 1.
-- 3. For each duplicate group: choose the lowest `id` as the canonical product (keep_id), and for each duplicate product (dup_id):
--    - Move/merge dependent rows to keep_id (sale_items.product_id, purchase_items.product_id, etc.)
--    - For product_variants belonging to the duplicate product:
--        * If the keep product already has a variant with same mrp -> merge stock into that variant and reassign references
--        * Else reassign variant.product_id to keep_id
--    - After dependencies are updated, delete the duplicate product row.
-- 4. Operates inside a PL/pgSQL DO block with per-group savepoints to continue on errors.
-- NOTE: This is a generic script — check your schema for additional foreign key tables that reference products and add them to the "dependent_tables" list if needed.

-- Safety check: abort if run on an empty or non-target DB
DO $$
DECLARE
  ts text := to_char(now(), 'YYYYMMDD_HH24MISS');
  backup_products_table text := format('products_backup_%s', ts);
  backup_variants_table text := format('product_variants_backup_%s', ts);
  rec record;
  grp record;
  dup_id int;
  keep_id int;
  v record;
  target_vid int;
  affected int;
BEGIN
  RAISE NOTICE 'Creating backups: % and %', backup_products_table, backup_variants_table;
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I AS SELECT * FROM products', backup_products_table);
  BEGIN
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I AS SELECT * FROM product_variants', backup_variants_table);
  EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'product_variants table not found; skipping variants backup';
  END;

  -- Temporary table listing duplicate groups: same lower(sku) and mrp-text
  CREATE TEMP TABLE _dup_groups ON COMMIT DROP AS
  SELECT lower(sku) AS sku_lc, COALESCE(mrp::text,'__NULL__') AS mrp_text, array_agg(id ORDER BY id) AS ids, min(id) AS keep_id, count(*) AS cnt
  FROM products
  WHERE sku IS NOT NULL AND trim(sku) <> ''
  GROUP BY 1,2
  HAVING COUNT(*) > 1;

  RAISE NOTICE 'Found % duplicate SKU+MRP groups', (SELECT count(*) FROM _dup_groups);

  FOR grp IN SELECT * FROM _dup_groups LOOP
    RAISE NOTICE 'Processing group sku=% mrp=% keep_id=% count=%', grp.sku_lc, grp.mrp_text, grp.keep_id, grp.cnt;

    -- do group-level savepoint so errors don't stop whole script
    BEGIN
      PERFORM pg_advisory_xact_lock(42); -- short advisory to serialize if needed
      -- iterate duplicate ids except keep_id
      FOREACH dup_id IN ARRAY grp.ids LOOP
        IF dup_id = grp.keep_id THEN
          CONTINUE;
        END IF;

        RAISE NOTICE ' Merging duplicate product id % -> keep %', dup_id, grp.keep_id;

        -- 1) Reassign product_id in common dependent tables. Update if the columns exist.
        -- sale_items
        BEGIN
          EXECUTE 'UPDATE sale_items SET product_id = $1 WHERE product_id = $2' USING grp.keep_id, dup_id;
          GET DIAGNOSTICS affected = ROW_COUNT;
          IF affected > 0 THEN RAISE NOTICE '   sale_items moved: %', affected; END IF;
        EXCEPTION WHEN undefined_table THEN
          RAISE NOTICE '   sale_items table not present; skipping';
        END;

        -- purchase_items
        BEGIN
          EXECUTE 'UPDATE purchase_items SET product_id = $1 WHERE product_id = $2' USING grp.keep_id, dup_id;
          GET DIAGNOSTICS affected = ROW_COUNT;
          IF affected > 0 THEN RAISE NOTICE '   purchase_items moved: %', affected; END IF;
        EXCEPTION WHEN undefined_table THEN
          RAISE NOTICE '   purchase_items table not present; skipping';
        END;

        -- stock_movements or inventory adjustments (common names) - add safe best-effort
        BEGIN
          EXECUTE 'UPDATE stock_movements SET product_id = $1 WHERE product_id = $2' USING grp.keep_id, dup_id;
          GET DIAGNOSTICS affected = ROW_COUNT; IF affected > 0 THEN RAISE NOTICE '   stock_movements moved: %', affected; END IF;
        EXCEPTION WHEN undefined_table THEN NULL; END;

        BEGIN
          EXECUTE 'UPDATE inventories SET product_id = $1 WHERE product_id = $2' USING grp.keep_id, dup_id;
          GET DIAGNOSTICS affected = ROW_COUNT; IF affected > 0 THEN RAISE NOTICE '   inventories moved: %', affected; END IF;
        EXCEPTION WHEN undefined_table THEN NULL; END;

        -- 2) Handle product_variants: move or merge
        BEGIN
          FOR v IN SELECT * FROM product_variants WHERE product_id = dup_id LOOP
            -- try find a variant under keep_id with same mrp
            SELECT id INTO target_vid FROM product_variants WHERE product_id = grp.keep_id AND (mrp IS NOT DISTINCT FROM v.mrp) LIMIT 1;
            IF FOUND THEN
              -- merge stock: add v.stock into existing target_vid
              BEGIN
                EXECUTE 'UPDATE product_variants SET stock = COALESCE(stock,0) + COALESCE($1,0) WHERE id = $2' USING v.stock, target_vid;
                -- move references to variant id in sale_items/purchase_items if variant_id columns exist
                BEGIN
                  EXECUTE 'UPDATE sale_items SET product_variant_id = $1 WHERE product_variant_id = $2' USING target_vid, v.id;
                EXCEPTION WHEN undefined_table THEN NULL; END;
                BEGIN
                  EXECUTE 'UPDATE purchase_items SET product_variant_id = $1 WHERE product_variant_id = $2' USING target_vid, v.id;
                EXCEPTION WHEN undefined_table THEN NULL; END;
                -- delete the old variant
                EXECUTE 'DELETE FROM product_variants WHERE id = $1' USING v.id;
                RAISE NOTICE '   variant % merged into %', v.id, target_vid;
              EXCEPTION WHEN others THEN
                RAISE NOTICE '   failed merging variant % into %: %', v.id, target_vid, SQLERRM;
              END;
            ELSE
              -- no conflict: reassign product_id to keep product
              EXECUTE 'UPDATE product_variants SET product_id = $1 WHERE id = $2' USING grp.keep_id, v.id;
              RAISE NOTICE '   variant % moved to product %', v.id, grp.keep_id;
            END IF;
          END LOOP;
        EXCEPTION WHEN undefined_table THEN
          RAISE NOTICE '   product_variants table not present; skipping variants migration';
        END;

        -- 3) If there are other tables that have product_id FK, you can add similar blocks above.

        -- 4) After fixing references, attempt to delete the duplicate product
        BEGIN
          EXECUTE 'DELETE FROM products WHERE id = $1' USING dup_id;
          GET DIAGNOSTICS affected = ROW_COUNT;
          IF affected > 0 THEN RAISE NOTICE '   deleted duplicate product id %', dup_id; ELSE RAISE NOTICE '   duplicate product id % not deleted (maybe referenced)', dup_id; END IF;
        EXCEPTION WHEN others THEN
          RAISE NOTICE '   failed to delete duplicate product id %: %', dup_id, SQLERRM;
        END;

      END LOOP;

    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Error processing group sku=% mrp=% : %', grp.sku_lc, grp.mrp_text, SQLERRM;
      -- continue with next group
    END;

  END LOOP;

  RAISE NOTICE 'Deduplication finished. You should verify results and remove backups manually when ready.';
END$$;

-- After running: please manually inspect data, then VACUUM/ANALYZE and reindex if needed.
-- Example maintenance commands (run as admin):
-- VACUUM ANALYZE products;
-- VACUUM ANALYZE product_variants;
-- REINDEX TABLE products;
-- REINDEX TABLE product_variants;

-- You may also want to inspect a summary of SKU counts:
-- SELECT lower(sku) sku_lc, mrp, count(*) FROM products GROUP BY 1,2 ORDER BY 3 DESC LIMIT 50;

-- End of script
