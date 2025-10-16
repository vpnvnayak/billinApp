-- 019_add_username_phone_to_users.sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users (username);
