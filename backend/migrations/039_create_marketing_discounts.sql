-- 039_create_marketing_discounts.sql
-- Create table to store marketing discounts
CREATE TABLE IF NOT EXISTS marketing_discounts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB
);

CREATE INDEX IF NOT EXISTS idx_marketing_discounts_created_at ON marketing_discounts(created_at DESC);
