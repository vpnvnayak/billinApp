-- 020_cleanup_stores_table.sql
-- Remove extraneous auth columns from stores (they belong to users)
ALTER TABLE stores
  DROP COLUMN IF EXISTS username,
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS password_hash;

-- drop indexes that referenced those columns
DROP INDEX IF EXISTS stores_username_idx;
DROP INDEX IF EXISTS stores_email_idx;
