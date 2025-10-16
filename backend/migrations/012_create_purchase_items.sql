-- Create purchase_items table
CREATE TABLE IF NOT EXISTS purchase_items (
  id SERIAL PRIMARY KEY,
  purchase_id INTEGER REFERENCES purchases(id) ON DELETE CASCADE,
  product_id INTEGER,
  sku VARCHAR(100),
  name VARCHAR(255),
  qty NUMERIC(12,2) DEFAULT 0,
  price NUMERIC(12,2) DEFAULT 0,
  line_total NUMERIC(14,2) DEFAULT 0
);
