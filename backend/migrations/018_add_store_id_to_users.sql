-- 018_add_store_id_to_users.sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS store_id INT REFERENCES stores(id) ON DELETE SET NULL;

-- optional index for faster lookups
CREATE INDEX IF NOT EXISTS users_store_id_idx ON users (store_id);
