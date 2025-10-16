-- Add store_id to suppliers so suppliers can be scoped to stores
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS store_id INTEGER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'stores') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_store_id_fkey') THEN
      ALTER TABLE suppliers ADD CONSTRAINT suppliers_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
    END IF;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_suppliers_store_id ON suppliers(store_id);
