-- Add disabled column to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS disabled boolean DEFAULT false;
