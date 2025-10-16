-- Add store_id to sales and sale_items for tenant scoping
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS store_id INTEGER;

-- add store_id to sale_items (optional but useful for ownership queries)
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS store_id INTEGER;

-- Conditionally add foreign key constraints if stores table exists and constraints are not present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'stores') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_store_id_fkey') THEN
      ALTER TABLE sales ADD CONSTRAINT sales_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_store_id_fkey') THEN
      ALTER TABLE sale_items ADD CONSTRAINT sale_items_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
    END IF;
  END IF;
END$$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON sales(store_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_store_id ON sale_items(store_id);
