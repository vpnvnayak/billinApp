-- 042_map_products_to_categories.sql
-- Map existing products to categories/subcategories based on product name and SKU heuristics
-- This migration updates `products.category_id` and `products.subcategory_id` for common supermarket items.

BEGIN;

-- Helper: perform an update for a given category/subcategory by name patterns
-- NOTE: relies on categories/subcategories already existing (migration 040 + 041)

-- Dairy & Eggs: milk, cheese, yogurt, butter, eggs, paneer
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Dairy & Eggs' LIMIT 1),
  subcategory_id = (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Dairy & Eggs' LIMIT 1) AND name = 'Milk' LIMIT 1)
WHERE LOWER(name) LIKE '%milk%'
  OR LOWER(name) LIKE '%paneer%'
  OR LOWER(name) LIKE '%full cream milk%'
  OR LOWER(name) LIKE '%cheese%'
  OR LOWER(name) LIKE '%yogurt%'
  OR LOWER(name) LIKE '%curd%'
  OR LOWER(name) LIKE '%butter%'
  OR LOWER(name) LIKE '%egg%';

-- Bakery: bread, cake, biscuit, cookie, pastry
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Bakery' LIMIT 1),
  subcategory_id = (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Bakery' LIMIT 1) AND name = 'Bread' LIMIT 1)
WHERE LOWER(name) LIKE '%bread%'
  OR LOWER(name) LIKE '%bun%'
  OR LOWER(name) LIKE '%cake%'
  OR LOWER(name) LIKE '%pastry%'
  OR LOWER(name) LIKE '%biscuit%'
  OR LOWER(name) LIKE '%cookie%';

-- Fruits: apples, bananas, oranges, mangoes, grapes, berries
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Fruits & Vegetables' LIMIT 1),
  subcategory_id = (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Fruits & Vegetables' LIMIT 1) AND name = 'Fresh Fruits' LIMIT 1)
WHERE LOWER(name) LIKE '%apple%'
  OR LOWER(name) LIKE '%banana%'
  OR LOWER(name) LIKE '%orange%'
  OR LOWER(name) LIKE '%mango%'
  OR LOWER(name) LIKE '%grape%'
  OR LOWER(name) LIKE '%berry%'
  OR LOWER(name) LIKE '%pineapple%'
  OR LOWER(name) LIKE '%watermelon%'
  OR LOWER(name) LIKE '%pear%';

-- Vegetables: potato, tomato, onion, carrot, cucumber, leafy greens
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Fruits & Vegetables' LIMIT 1),
  subcategory_id = (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Fruits & Vegetables' LIMIT 1) AND name = 'Fresh Vegetables' LIMIT 1)
WHERE LOWER(name) LIKE '%potato%'
  OR LOWER(name) LIKE '%tomato%'
  OR LOWER(name) LIKE '%onion%'
  OR LOWER(name) LIKE '%carrot%'
  OR LOWER(name) LIKE '%cucumber%'
  OR LOWER(name) LIKE '%lettuce%'
  OR LOWER(name) LIKE '%spinach%'
  OR LOWER(name) LIKE '%broccoli%'
  OR LOWER(name) LIKE '%cauliflower%';

-- Meat & Seafood: fresh meat, poultry, fish, shrimp
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Meat & Seafood' LIMIT 1),
  subcategory_id = (CASE
    WHEN LOWER(name) LIKE '%chicken%' OR LOWER(name) LIKE '%turkey%' THEN (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Meat & Seafood' LIMIT 1) AND name = 'Poultry' LIMIT 1)
    WHEN LOWER(name) LIKE '%fish%' OR LOWER(name) LIKE '%salmon%' OR LOWER(name) LIKE '%tuna%' OR LOWER(name) LIKE '%shrimp%' OR LOWER(name) LIKE '%prawn%' THEN (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Meat & Seafood' LIMIT 1) AND name = 'Fish & Seafood' LIMIT 1)
    ELSE (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Meat & Seafood' LIMIT 1) AND name = 'Fresh Meat' LIMIT 1)
  END)
WHERE LOWER(name) LIKE '%chicken%'
  OR LOWER(name) LIKE '%turkey%'
  OR LOWER(name) LIKE '%beef%'
  OR LOWER(name) LIKE '%pork%'
  OR LOWER(name) LIKE '%mutton%'
  OR LOWER(name) LIKE '%lamb%'
  OR LOWER(name) LIKE '%fish%'
  OR LOWER(name) LIKE '%salmon%'
  OR LOWER(name) LIKE '%tuna%'
  OR LOWER(name) LIKE '%shrimp%'
  OR LOWER(name) LIKE '%prawn%';

-- Frozen Foods: ice cream, frozen
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Frozen Foods' LIMIT 1),
  subcategory_id = (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Frozen Foods' LIMIT 1) AND name = 'Ice Cream & Desserts' LIMIT 1)
WHERE LOWER(name) LIKE '%ice cream%'
  OR LOWER(name) LIKE '%ice-cream%'
  OR LOWER(name) LIKE '%frozen%';

-- Pantry: rice, grains, pasta, flour, sugar, salt, oil
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Pantry' LIMIT 1),
  subcategory_id = (CASE
    WHEN LOWER(name) LIKE '%rice%' OR LOWER(name) LIKE '%basmati%' OR LOWER(name) LIKE '%wheat%' OR LOWER(name) LIKE '%atta%' THEN (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Pantry' LIMIT 1) AND name = 'Rice & Grains' LIMIT 1)
    WHEN LOWER(name) LIKE '%pasta%' OR LOWER(name) LIKE '%noodle%' OR LOWER(name) LIKE '%spaghetti%' THEN (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Pantry' LIMIT 1) AND name = 'Pasta & Noodles' LIMIT 1)
    WHEN LOWER(name) LIKE '%oil%' OR LOWER(name) LIKE '%olive%' OR LOWER(name) LIKE '%sunflower%' OR LOWER(name) LIKE '%mustard oil%' THEN (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Pantry' LIMIT 1) AND name = 'Oils & Vinegars' LIMIT 1)
    ELSE (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Pantry' LIMIT 1) AND name = 'Rice & Grains' LIMIT 1)
  END)
WHERE LOWER(name) LIKE '%rice%'
  OR LOWER(name) LIKE '%basmati%'
  OR LOWER(name) LIKE '%wheat%'
  OR LOWER(name) LIKE '%atta%'
  OR LOWER(name) LIKE '%pasta%'
  OR LOWER(name) LIKE '%noodle%'
  OR LOWER(name) LIKE '%flour%'
  OR LOWER(name) LIKE '%sugar%'
  OR LOWER(name) LIKE '%salt%'
  OR LOWER(name) LIKE '%oil%'
  OR LOWER(name) LIKE '%vinegar%';

-- Snacks & Confectionery
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Snacks & Confectionery' LIMIT 1),
  subcategory_id = (CASE
    WHEN LOWER(name) LIKE '%chips%' OR LOWER(name) LIKE '%crisps%' THEN (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Snacks & Confectionery' LIMIT 1) AND name = 'Chips & Crisps' LIMIT 1)
    WHEN LOWER(name) LIKE '%chocolate%' OR LOWER(name) LIKE '%candy%' OR LOWER(name) LIKE '%sweets%' THEN (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Snacks & Confectionery' LIMIT 1) AND name = 'Chocolate & Candy' LIMIT 1)
    ELSE (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Snacks & Confectionery' LIMIT 1) AND name = 'Chips & Crisps' LIMIT 1)
  END)
WHERE LOWER(name) LIKE '%chip%'
  OR LOWER(name) LIKE '%crisps%'
  OR LOWER(name) LIKE '%biscuits%'
  OR LOWER(name) LIKE '%cookie%'
  OR LOWER(name) LIKE '%chocolate%'
  OR LOWER(name) LIKE '%candy%'
  OR LOWER(name) LIKE '%nuts%'
  OR LOWER(name) LIKE '%seeds%';

-- Beverages: water, juice, tea, coffee, soft drinks
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Beverages' LIMIT 1),
  subcategory_id = (CASE
    WHEN LOWER(name) LIKE '%tea%' OR LOWER(name) LIKE '%coffee%' THEN (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Beverages' LIMIT 1) AND name = 'Tea & Coffee' LIMIT 1)
    WHEN LOWER(name) LIKE '%water%' THEN (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Beverages' LIMIT 1) AND name = 'Water' LIMIT 1)
    ELSE (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Beverages' LIMIT 1) AND name = 'Juices & Drinks' LIMIT 1)
  END)
WHERE LOWER(name) LIKE '%water%'
  OR LOWER(name) LIKE '%juice%'
  OR LOWER(name) LIKE '%cola%'
  OR LOWER(name) LIKE '%soda%'
  OR LOWER(name) LIKE '%tea%'
  OR LOWER(name) LIKE '%coffee%';

-- Personal Care
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Personal Care' LIMIT 1),
  subcategory_id = (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Personal Care' LIMIT 1) AND name = 'Skin Care' LIMIT 1)
WHERE LOWER(name) LIKE '%shampoo%'
  OR LOWER(name) LIKE '%soap%'
  OR LOWER(name) LIKE '%toothpaste%'
  OR LOWER(name) LIKE '%toothbrush%'
  OR LOWER(name) LIKE '%deodorant%'
  OR LOWER(name) LIKE '%lotion%'
  OR LOWER(name) LIKE '%face wash%'
  OR LOWER(name) LIKE '%facewash%';

-- Household
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Household' LIMIT 1),
  subcategory_id = (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Household' LIMIT 1) AND name = 'Cleaning' LIMIT 1)
WHERE LOWER(name) LIKE '%detergent%'
  OR LOWER(name) LIKE '%washing%'
  OR LOWER(name) LIKE '%cleaner%'
  OR LOWER(name) LIKE '%bleach%'
  OR LOWER(name) LIKE '%paper towel%'
  OR LOWER(name) LIKE '%toilet paper%';

-- Baby Care
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Baby Care' LIMIT 1),
  subcategory_id = (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Baby Care' LIMIT 1) AND name = 'Baby Food' LIMIT 1)
WHERE LOWER(name) LIKE '%diaper%'
  OR LOWER(name) LIKE '%nappy%'
  OR LOWER(name) LIKE '%baby food%'
  OR LOWER(name) LIKE '%baby wipe%'
  OR LOWER(name) LIKE '%baby%wipe%';

-- Pet Supplies
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Pet Supplies' LIMIT 1),
  subcategory_id = (CASE WHEN LOWER(name) LIKE '%dog%' THEN (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Pet Supplies' LIMIT 1) AND name = 'Dog Food' LIMIT 1) WHEN LOWER(name) LIKE '%cat%' THEN (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Pet Supplies' LIMIT 1) AND name = 'Cat Food' LIMIT 1) ELSE (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Pet Supplies' LIMIT 1) AND name = 'Pet Care' LIMIT 1) END)
WHERE LOWER(name) LIKE '%dog food%'
  OR LOWER(name) LIKE '%cat food%'
  OR LOWER(name) LIKE '%pet food%';

-- Health & Wellness
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Health & Wellness' LIMIT 1),
  subcategory_id = (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Health & Wellness' LIMIT 1) AND name = 'Vitamins & Supplements' LIMIT 1)
WHERE LOWER(name) LIKE '%vitamin%'
  OR LOWER(name) LIKE '%supplement%'
  OR LOWER(name) LIKE '%protein%'
  OR LOWER(name) LIKE '%health drink%';

-- Alcohol
UPDATE products SET
  category_id = (SELECT id FROM categories WHERE name = 'Alcohol' LIMIT 1),
  subcategory_id = (SELECT id FROM subcategories WHERE category_id = (SELECT id FROM categories WHERE name = 'Alcohol' LIMIT 1) AND name = 'Beer' LIMIT 1)
WHERE LOWER(name) LIKE '%beer%'
  OR LOWER(name) LIKE '%wine%'
  OR LOWER(name) LIKE '%whisk%'
  OR LOWER(name) LIKE '%vodka%'
  OR LOWER(name) LIKE '%rum%'
  OR LOWER(name) LIKE '%gin%';

COMMIT;

-- Notes:
-- - This mapping is heuristic-based (name substring matching) and intended as a convenience to bootstrap categories.
-- - It will not be perfect — review results and correct mismatches manually or extend rules.
-- - If you need stricter mapping by SKU/barcode, provide a list of SKU->category mappings and we can add explicit matching rules.
