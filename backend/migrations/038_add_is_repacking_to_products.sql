-- Add is_repacking column to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_repacking BOOLEAN DEFAULT false NOT NULL;
