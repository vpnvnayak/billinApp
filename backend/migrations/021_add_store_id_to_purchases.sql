-- Add store_id to purchases so purchases can be scoped to a store (tenant)
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS store_id INTEGER;

-- Add FK to stores table if it exists. Use ON DELETE SET NULL to avoid cascading deletes.
DO $$
BEGIN
  -- only add FK if stores table exists and constraint doesn't already exist
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'stores') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_store_id_fkey') THEN
      ALTER TABLE purchases ADD CONSTRAINT purchases_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
    END IF;
  END IF;
END$$;

-- Index for faster scoping queries
CREATE INDEX IF NOT EXISTS idx_purchases_store_id ON purchases(store_id);
