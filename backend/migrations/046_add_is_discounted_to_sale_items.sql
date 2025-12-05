-- Add is_discounted column to sale_items table
-- This column tracks whether a product was sold with a discount offer applied

ALTER TABLE sale_items 
ADD COLUMN IF NOT EXISTS is_discounted BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN sale_items.is_discounted IS 'Indicates if this item was sold with a discount offer applied';
