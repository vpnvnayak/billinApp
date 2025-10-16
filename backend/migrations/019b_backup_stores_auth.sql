-- 019b_backup_stores_auth.sql
-- Backup any auth-like fields from stores before later cleanup (safe, idempotent)

CREATE TABLE IF NOT EXISTS stores_auth_backup (
  store_id INTEGER PRIMARY KEY,
  username TEXT,
  email TEXT,
  phone TEXT,
  password_hash TEXT,
  backed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Upsert rows from stores into backup table without referencing columns that may not exist.
-- We use row_to_json(stores.*) so missing columns simply won't appear in the JSON object.

-- 1) Update existing backup rows from stores
WITH src AS (
  SELECT id AS store_id, row_to_json(stores.*) AS j
  FROM stores
)
UPDATE stores_auth_backup b
SET username = s.j->>'username',
    email = s.j->>'email',
    phone = s.j->>'phone',
    password_hash = s.j->>'password_hash',
    backed_at = now()
FROM src s
WHERE b.store_id = s.store_id
  AND (
    (s.j->>'username' IS NOT NULL AND s.j->>'username' <> '') OR
    (s.j->>'email' IS NOT NULL AND s.j->>'email' <> '') OR
    (s.j->>'password_hash' IS NOT NULL AND s.j->>'password_hash' <> '')
  );

-- 2) Insert missing backup rows for stores not present in backup yet
WITH src AS (
  SELECT id AS store_id, row_to_json(stores.*) AS j
  FROM stores
)
INSERT INTO stores_auth_backup (store_id, username, email, phone, password_hash, backed_at)
SELECT s.store_id,
       s.j->>'username',
       s.j->>'email',
       s.j->>'phone',
       s.j->>'password_hash',
       now()
FROM src s
WHERE (
    (s.j->>'username' IS NOT NULL AND s.j->>'username' <> '') OR
    (s.j->>'email' IS NOT NULL AND s.j->>'email' <> '') OR
    (s.j->>'password_hash' IS NOT NULL AND s.j->>'password_hash' <> '')
  )
  AND NOT EXISTS (SELECT 1 FROM stores_auth_backup b WHERE b.store_id = s.store_id);

CREATE INDEX IF NOT EXISTS idx_stores_auth_backup_store_id ON stores_auth_backup(store_id);
