-- Migration: create store_settings table
-- Run this in your Postgres database connected by DATABASE_URL

CREATE TABLE IF NOT EXISTS store_settings (
  id integer PRIMARY KEY,
  name text,
  address text,
  contact text,
  gst_id text,
  website text,
  bank_name text,
  bank_branch text,
  account_no text,
  ifsc text,
  account_name text,
  tax_rate numeric,
  timezone text,
  hours jsonb,
  logo_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure a single-row with id=1 exists (empty)
INSERT INTO store_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
