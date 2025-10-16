-- Migration: add `hours` column to store_settings and ensure unique constraint on store_id
-- Add hours JSONB/text column and create unique constraint/index on store_id so ON CONFLICT(store_id) works

BEGIN;

-- add hours column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='store_settings' AND column_name='hours'
    ) THEN
        ALTER TABLE store_settings ADD COLUMN hours jsonb;
    END IF;
END$$;

-- ensure store_id exists and is unique (create unique index if not present)
DO $$
BEGIN
    -- create store_id column if missing (legacy tables may have id primary key only)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='store_settings' AND column_name='store_id'
    ) THEN
        ALTER TABLE store_settings ADD COLUMN store_id integer;
    END IF;

    -- create unique index on store_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE tablename='store_settings' AND indexname='ux_store_settings_store_id'
    ) THEN
        CREATE UNIQUE INDEX ux_store_settings_store_id ON store_settings(store_id);
    END IF;

    -- if there's no primary key on id, ensure id remains usable by leaving alone
END$$;

COMMIT;
