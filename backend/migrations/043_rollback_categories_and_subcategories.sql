-- 043_rollback_categories_and_subcategories.sql
-- Safe rollback: back up categories/subcategories and products' category refs, then drop columns/tables
-- This migration is reversible by restoring from the backup tables created here.

BEGIN;

-- Use a timestamped backup table name to avoid collisions. Adjust timestamp if rerunning.
-- 1) Backup `categories` (structure + data)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'categories_backup_20251129') THEN
    CREATE TABLE categories_backup_20251129 (LIKE categories INCLUDING ALL);
    INSERT INTO categories_backup_20251129 SELECT * FROM categories;
  END IF;
END$$;

-- 2) Backup `subcategories`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subcategories_backup_20251129') THEN
    CREATE TABLE subcategories_backup_20251129 (LIKE subcategories INCLUDING ALL);
    INSERT INTO subcategories_backup_20251129 SELECT * FROM subcategories;
  END IF;
END$$;

-- 3) Backup product -> category / subcategory mappings (only rows that have values)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'products_category_backup_20251129') THEN
    CREATE TABLE products_category_backup_20251129 (
      product_id INTEGER PRIMARY KEY,
      category_id INTEGER,
      subcategory_id INTEGER
    );
    INSERT INTO products_category_backup_20251129 (product_id, category_id, subcategory_id)
      SELECT id, category_id, subcategory_id FROM products WHERE category_id IS NOT NULL OR subcategory_id IS NOT NULL;
  END IF;
END$$;

-- 4) Now remove the product foreign key columns if they exist
ALTER TABLE products DROP COLUMN IF EXISTS subcategory_id;
ALTER TABLE products DROP COLUMN IF EXISTS category_id;

-- 5) Drop subcategories and categories tables (cascade to remove dependent objects)
DROP TABLE IF EXISTS subcategories CASCADE;
DROP TABLE IF EXISTS categories CASCADE;

COMMIT;

-- Restore instructions (reversible):
-- To restore the original tables and product refs from the backups created by this migration,
-- run the following steps manually (example):
--
-- 1) Recreate `categories` table with the original schema (if you want the exact schema, use
--    `CREATE TABLE categories (LIKE categories_backup_20251129 INCLUDING ALL);` and then
--    `INSERT INTO categories SELECT * FROM categories_backup_20251129;`)
--
-- 2) Recreate `subcategories` similarly and restore data from `subcategories_backup_20251129`.
--
-- 3) Re-add columns to `products`:
--    ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
--    ALTER TABLE products ADD COLUMN subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL;
--
-- 4) Restore product mappings:
--    INSERT INTO products (id, category_id, subcategory_id) ... OR
--    UPDATE products p SET category_id = b.category_id, subcategory_id = b.subcategory_id FROM products_category_backup_20251129 b WHERE p.id = b.product_id;
--
-- Note: The above manual steps require care if your products/categories tables have changed since this backup.
