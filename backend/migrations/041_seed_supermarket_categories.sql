-- 041_seed_supermarket_categories.sql
-- Seed initial categories and subcategories commonly used in supermarkets

BEGIN;

-- Insert top-level categories (id assigned by SERIAL)
INSERT INTO categories (name, slug, created_by, meta)
VALUES
  ('Beverages', 'beverages', NULL, '{}'),
  ('Dairy & Eggs', 'dairy-eggs', NULL, '{}'),
  ('Bakery', 'bakery', NULL, '{}'),
  ('Fruits & Vegetables', 'fruits-vegetables', NULL, '{}'),
  ('Meat & Seafood', 'meat-seafood', NULL, '{}'),
  ('Frozen Foods', 'frozen-foods', NULL, '{}'),
  ('Pantry', 'pantry', NULL, '{}'),
  ('Snacks & Confectionery', 'snacks-confectionery', NULL, '{}'),
  ('Personal Care', 'personal-care', NULL, '{}'),
  ('Household', 'household', NULL, '{}'),
  ('Baby Care', 'baby-care', NULL, '{}'),
  ('Pet Supplies', 'pet-supplies', NULL, '{}'),
  ('Health & Wellness', 'health-wellness', NULL, '{}'),
  ('Alcohol', 'alcohol', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Subcategories: reference parent category by name lookup
-- Beverages
INSERT INTO subcategories (category_id, name, slug, created_by, meta)
VALUES
  ((SELECT id FROM categories WHERE name='Beverages' LIMIT 1), 'Tea & Coffee', 'tea-coffee', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Beverages' LIMIT 1), 'Soft Drinks', 'soft-drinks', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Beverages' LIMIT 1), 'Juices & Drinks', 'juices-drinks', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Beverages' LIMIT 1), 'Water', 'water', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Dairy & Eggs
INSERT INTO subcategories (category_id, name, slug, created_by, meta)
VALUES
  ((SELECT id FROM categories WHERE name='Dairy & Eggs' LIMIT 1), 'Milk', 'milk', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Dairy & Eggs' LIMIT 1), 'Cheese', 'cheese', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Dairy & Eggs' LIMIT 1), 'Yogurt', 'yogurt', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Dairy & Eggs' LIMIT 1), 'Butter & Margarine', 'butter-margarine', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Dairy & Eggs' LIMIT 1), 'Eggs', 'eggs', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Bakery
INSERT INTO subcategories (category_id, name, slug, created_by, meta)
VALUES
  ((SELECT id FROM categories WHERE name='Bakery' LIMIT 1), 'Bread', 'bread', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Bakery' LIMIT 1), 'Cakes & Pastries', 'cakes-pastries', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Bakery' LIMIT 1), 'Biscuits & Cookies', 'biscuits-cookies', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Fruits & Vegetables
INSERT INTO subcategories (category_id, name, slug, created_by, meta)
VALUES
  ((SELECT id FROM categories WHERE name='Fruits & Vegetables' LIMIT 1), 'Fresh Fruits', 'fresh-fruits', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Fruits & Vegetables' LIMIT 1), 'Fresh Vegetables', 'fresh-vegetables', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Fruits & Vegetables' LIMIT 1), 'Organic', 'organic', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Meat & Seafood
INSERT INTO subcategories (category_id, name, slug, created_by, meta)
VALUES
  ((SELECT id FROM categories WHERE name='Meat & Seafood' LIMIT 1), 'Fresh Meat', 'fresh-meat', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Meat & Seafood' LIMIT 1), 'Poultry', 'poultry', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Meat & Seafood' LIMIT 1), 'Fish & Seafood', 'fish-seafood', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Frozen Foods
INSERT INTO subcategories (category_id, name, slug, created_by, meta)
VALUES
  ((SELECT id FROM categories WHERE name='Frozen Foods' LIMIT 1), 'Frozen Meals', 'frozen-meals', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Frozen Foods' LIMIT 1), 'Ice Cream & Desserts', 'ice-cream-desserts', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Frozen Foods' LIMIT 1), 'Frozen Vegetables', 'frozen-vegetables', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Pantry
INSERT INTO subcategories (category_id, name, slug, created_by, meta)
VALUES
  ((SELECT id FROM categories WHERE name='Pantry' LIMIT 1), 'Rice & Grains', 'rice-grains', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Pantry' LIMIT 1), 'Pasta & Noodles', 'pasta-noodles', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Pantry' LIMIT 1), 'Oils & Vinegars', 'oils-vinegars', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Pantry' LIMIT 1), 'Sauces & Condiments', 'sauces-condiments', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Pantry' LIMIT 1), 'Spices & Seasonings', 'spices-seasonings', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Snacks & Confectionery
INSERT INTO subcategories (category_id, name, slug, created_by, meta)
VALUES
  ((SELECT id FROM categories WHERE name='Snacks & Confectionery' LIMIT 1), 'Chips & Crisps', 'chips-crisps', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Snacks & Confectionery' LIMIT 1), 'Nuts & Seeds', 'nuts-seeds', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Snacks & Confectionery' LIMIT 1), 'Chocolate & Candy', 'chocolate-candy', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Personal Care
INSERT INTO subcategories (category_id, name, slug, created_by, meta)
VALUES
  ((SELECT id FROM categories WHERE name='Personal Care' LIMIT 1), 'Oral Care', 'oral-care', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Personal Care' LIMIT 1), 'Hair Care', 'hair-care', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Personal Care' LIMIT 1), 'Skin Care', 'skin-care', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Personal Care' LIMIT 1), 'Feminine Care', 'feminine-care', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Household
INSERT INTO subcategories (category_id, name, slug, created_by, meta)
VALUES
  ((SELECT id FROM categories WHERE name='Household' LIMIT 1), 'Cleaning', 'cleaning', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Household' LIMIT 1), 'Laundry', 'laundry', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Household' LIMIT 1), 'Paper Products', 'paper-products', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Household' LIMIT 1), 'Kitchen Supplies', 'kitchen-supplies', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Baby Care
INSERT INTO subcategories (category_id, name, slug, created_by, meta)
VALUES
  ((SELECT id FROM categories WHERE name='Baby Care' LIMIT 1), 'Diapers & Wipes', 'diapers-wipes', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Baby Care' LIMIT 1), 'Baby Food', 'baby-food', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Baby Care' LIMIT 1), 'Baby Care Products', 'baby-care-products', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Pet Supplies
INSERT INTO subcategories (category_id, name, slug, created_by, meta)
VALUES
  ((SELECT id FROM categories WHERE name='Pet Supplies' LIMIT 1), 'Dog Food', 'dog-food', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Pet Supplies' LIMIT 1), 'Cat Food', 'cat-food', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Pet Supplies' LIMIT 1), 'Pet Care', 'pet-care', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Health & Wellness
INSERT INTO subcategories (category_id, name, slug, created_by, meta)
VALUES
  ((SELECT id FROM categories WHERE name='Health & Wellness' LIMIT 1), 'Vitamins & Supplements', 'vitamins-supplements', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Health & Wellness' LIMIT 1), 'First Aid', 'first-aid', NULL, '{}')
ON CONFLICT DO NOTHING;

-- Alcohol
INSERT INTO subcategories (category_id, name, slug, created_by, meta)
VALUES
  ((SELECT id FROM categories WHERE name='Alcohol' LIMIT 1), 'Beer', 'beer', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Alcohol' LIMIT 1), 'Wine', 'wine', NULL, '{}'),
  ((SELECT id FROM categories WHERE name='Alcohol' LIMIT 1), 'Spirits', 'spirits', NULL, '{}')
ON CONFLICT DO NOTHING;

COMMIT;

-- Notes:
-- - This migration seeds common supermarket categories and subcategories.
-- - If you already ran migration 040 to create the categories/subcategories tables, run the project's migration runner to apply this file.
-- - To map existing free-text category values from product imports, write a separate script to SELECT distinct(category_text) and map to created category rows.
