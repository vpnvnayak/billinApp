-- Migration: create posters table

CREATE TABLE IF NOT EXISTS posters (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  items JSONB,
  templates JSONB,
  meta JSONB
);

CREATE INDEX IF NOT EXISTS posters_created_at_idx ON posters(created_at DESC);
