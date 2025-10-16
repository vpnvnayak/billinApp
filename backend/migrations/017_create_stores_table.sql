-- 017_create_stores_table.sql
CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- optional index for lookup by username/email
-- create indexes only if the corresponding columns exist (some environments may have a trimmed stores table)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='username') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS stores_username_idx ON stores (username)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='email') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS stores_email_idx ON stores (email)';
  END IF;
END$$;
