-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) UNIQUE,
  name VARCHAR(255) NOT NULL,
  price NUMERIC(12,2) DEFAULT 0,
  mrp NUMERIC(12,2),
  unit VARCHAR(10),
  created_at TIMESTAMP DEFAULT now()
);
