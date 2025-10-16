-- Create purchases table
CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT now()
);
