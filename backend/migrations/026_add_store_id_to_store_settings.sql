-- Add store_id to store_settings so settings can be per-store
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS store_id INTEGER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'stores') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_settings_store_id_fkey') THEN
      ALTER TABLE store_settings ADD CONSTRAINT store_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
    END IF;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_store_settings_store_id ON store_settings(store_id);
