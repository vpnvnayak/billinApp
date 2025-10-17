-- Add loyalty_points column to customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS loyalty_points INTEGER DEFAULT 0;

-- backfill NULLs if any
UPDATE customers SET loyalty_points = 0 WHERE loyalty_points IS NULL;
