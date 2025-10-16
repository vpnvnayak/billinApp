-- Migration: drop hours column from store_settings (safe)
-- Use IF EXISTS so this is safe to run multiple times

ALTER TABLE store_settings DROP COLUMN IF EXISTS hours;
