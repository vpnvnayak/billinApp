-- Migration: add bank/account columns to store_settings
-- Safe to run multiple times: uses IF NOT EXISTS

ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS bank_branch text;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS account_no text;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS ifsc text;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS account_name text;

-- No row inserts required; the existing row with id=1 will simply have NULL for these columns until written.
