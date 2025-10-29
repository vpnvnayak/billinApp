-- Add hsn column to products
ALTER TABLE IF EXISTS products
  ADD COLUMN IF NOT EXISTS hsn VARCHAR(64);
