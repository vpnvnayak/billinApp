-- 040_create_categories_and_subcategories.sql
-- Create normalized categories and subcategories tables
-- Add category_id and subcategory_id to products (nullable)

BEGIN;

-- Categories table (top-level)
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  created_by INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  meta JSONB DEFAULT '{}'::jsonb
);

-- Subcategories table (belongs to a category)
CREATE TABLE IF NOT EXISTS subcategories (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  created_by INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  meta JSONB DEFAULT '{}'::jsonb
);

-- Unique / lookup indexes (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_lower ON categories(LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_subcategories_category_name_lower ON subcategories(category_id, LOWER(name));

-- Add FKs on products to reference normalized categories
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON products(subcategory_id);

COMMIT;

-- Notes:
-- 1) This migration creates normalized category tables and nullable FKs on products.
-- 2) Existing product data is not automatically moved; if you have pre-existing free-text
--    `category`/`subcategory` fields elsewhere, run data-migration SQL to create category
--    rows and set `products.category_id`/`products.subcategory_id` accordingly.
-- 3) After applying this migration, consider updating the products API to JOIN
--    `categories`/`subcategories` and return names, slugs, or IDs as desired.
