-- Add store_seq column to key tables and create triggers to auto-assign a per-store serial
-- Applies to: products, sales, purchases, customers, suppliers

-- NO-TRANSACTION

-- 1) Add column (nullable for global records)
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_seq INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS store_seq INTEGER;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS store_seq INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_seq INTEGER;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS store_seq INTEGER;

-- 2) Backfill existing rows partitioned by store_id
-- For rows with store_id IS NOT NULL, assign row_number() over (partition by store_id order by id)

-- products
UPDATE products p SET store_seq = sub.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY store_id ORDER BY id) AS rn
  FROM products WHERE store_id IS NOT NULL
) sub WHERE p.id = sub.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_store_store_seq ON products (store_id, store_seq);

-- sales
UPDATE sales s SET store_seq = sub.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY store_id ORDER BY id) AS rn
  FROM sales WHERE store_id IS NOT NULL
) sub WHERE s.id = sub.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_store_store_seq ON sales (store_id, store_seq);

-- purchases
UPDATE purchases p SET store_seq = sub.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY store_id ORDER BY id) AS rn
  FROM purchases WHERE store_id IS NOT NULL
) sub WHERE p.id = sub.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_store_store_seq ON purchases (store_id, store_seq);

-- customers
UPDATE customers c SET store_seq = sub.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY store_id ORDER BY id) AS rn
  FROM customers WHERE store_id IS NOT NULL
) sub WHERE c.id = sub.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_store_store_seq ON customers (store_id, store_seq);

-- suppliers
UPDATE suppliers s SET store_seq = sub.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY store_id ORDER BY id) AS rn
  FROM suppliers WHERE store_id IS NOT NULL
) sub WHERE s.id = sub.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_store_store_seq ON suppliers (store_id, store_seq);

-- 3) Create trigger functions to assign store_seq on insert.
-- We use pg_advisory_xact_lock with a table-specific lock key (two int keys) to avoid races.

CREATE OR REPLACE FUNCTION products_assign_store_seq() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  IF NEW.store_id IS NULL THEN
    NEW.store_seq := NULL;
    RETURN NEW;
  END IF;
  -- use table-specific lock key 1001 and store_id to lock per-store for products
  PERFORM pg_advisory_xact_lock(1001, NEW.store_id::int);
  SELECT COALESCE(MAX(store_seq), 0) + 1 INTO v_seq FROM products WHERE store_id = NEW.store_id;
  NEW.store_seq := v_seq;
  RETURN NEW;
END$$;

CREATE OR REPLACE FUNCTION sales_assign_store_seq() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_seq INTEGER; BEGIN
  IF NEW.store_id IS NULL THEN NEW.store_seq := NULL; RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(1002, NEW.store_id::int);
  SELECT COALESCE(MAX(store_seq), 0) + 1 INTO v_seq FROM sales WHERE store_id = NEW.store_id;
  NEW.store_seq := v_seq; RETURN NEW;
END$$;

CREATE OR REPLACE FUNCTION purchases_assign_store_seq() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_seq INTEGER; BEGIN
  IF NEW.store_id IS NULL THEN NEW.store_seq := NULL; RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(1003, NEW.store_id::int);
  SELECT COALESCE(MAX(store_seq), 0) + 1 INTO v_seq FROM purchases WHERE store_id = NEW.store_id;
  NEW.store_seq := v_seq; RETURN NEW;
END$$;

CREATE OR REPLACE FUNCTION customers_assign_store_seq() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_seq INTEGER; BEGIN
  IF NEW.store_id IS NULL THEN NEW.store_seq := NULL; RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(1004, NEW.store_id::int);
  SELECT COALESCE(MAX(store_seq), 0) + 1 INTO v_seq FROM customers WHERE store_id = NEW.store_id;
  NEW.store_seq := v_seq; RETURN NEW;
END$$;

CREATE OR REPLACE FUNCTION suppliers_assign_store_seq() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_seq INTEGER; BEGIN
  IF NEW.store_id IS NULL THEN NEW.store_seq := NULL; RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(1005, NEW.store_id::int);
  SELECT COALESCE(MAX(store_seq), 0) + 1 INTO v_seq FROM suppliers WHERE store_id = NEW.store_id;
  NEW.store_seq := v_seq; RETURN NEW;
END$$;

-- Create triggers: drop if exists, then create to ensure idempotency
DROP TRIGGER IF EXISTS products_store_seq_trg ON products;
CREATE TRIGGER products_store_seq_trg BEFORE INSERT ON products FOR EACH ROW EXECUTE PROCEDURE products_assign_store_seq();

DROP TRIGGER IF EXISTS sales_store_seq_trg ON sales;
CREATE TRIGGER sales_store_seq_trg BEFORE INSERT ON sales FOR EACH ROW EXECUTE PROCEDURE sales_assign_store_seq();

DROP TRIGGER IF EXISTS purchases_store_seq_trg ON purchases;
CREATE TRIGGER purchases_store_seq_trg BEFORE INSERT ON purchases FOR EACH ROW EXECUTE PROCEDURE purchases_assign_store_seq();

DROP TRIGGER IF EXISTS customers_store_seq_trg ON customers;
CREATE TRIGGER customers_store_seq_trg BEFORE INSERT ON customers FOR EACH ROW EXECUTE PROCEDURE customers_assign_store_seq();

DROP TRIGGER IF EXISTS suppliers_store_seq_trg ON suppliers;
CREATE TRIGGER suppliers_store_seq_trg BEFORE INSERT ON suppliers FOR EACH ROW EXECUTE PROCEDURE suppliers_assign_store_seq();

-- End migration
