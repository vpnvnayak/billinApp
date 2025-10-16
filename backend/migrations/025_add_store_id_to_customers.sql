-- Add store_id to customers for tenant scoping
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS store_id INTEGER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'stores') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_store_id_fkey') THEN
      ALTER TABLE customers ADD CONSTRAINT customers_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
    END IF;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers(store_id);
