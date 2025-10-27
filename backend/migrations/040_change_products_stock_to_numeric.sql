-- Change products.stock from INTEGER to NUMERIC to allow fractional quantities (e.g. 3.5)
BEGIN;

-- Only alter when column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='stock') THEN
    -- change type preserving existing values
    ALTER TABLE products ALTER COLUMN stock TYPE NUMERIC(12,2) USING stock::numeric;
  END IF;
END$$;

COMMIT;
