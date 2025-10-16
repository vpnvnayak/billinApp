-- Migration: make store_settings.id use a sequence/default so plain INSERTs without id don't fail
BEGIN;

-- If id column is integer and has no default, create a sequence and set default
DO $$
DECLARE
  has_default boolean;
  col_type text;
BEGIN
  SELECT column_default IS NOT NULL, data_type INTO has_default, col_type
  FROM information_schema.columns WHERE table_name='store_settings' AND column_name='id';

  IF NOT FOUND THEN
    -- table maybe missing; skip
    RAISE NOTICE 'store_settings.id column not found; skipping';
  ELSE
    IF col_type <> 'integer' THEN
      RAISE NOTICE 'store_settings.id is not integer (%), skipping', col_type;
    ELSEIF NOT has_default THEN
      PERFORM pg_notify('migrate', 'adding sequence to store_settings.id');
      -- create a sequence and set default
      EXECUTE 'CREATE SEQUENCE IF NOT EXISTS store_settings_id_seq';
      EXECUTE 'ALTER TABLE store_settings ALTER COLUMN id SET DEFAULT nextval(''store_settings_id_seq'')';
      -- set sequence ownership to the column
      EXECUTE 'ALTER SEQUENCE store_settings_id_seq OWNED BY store_settings.id';
      -- ensure sequence is at least max(id)
      EXECUTE 'SELECT setval(''store_settings_id_seq'', COALESCE((SELECT max(id) FROM store_settings),0) + 1, false)';
    ELSE
      RAISE NOTICE 'store_settings.id already has default, skipping';
    END IF;
  END IF;
END$$;

COMMIT;
