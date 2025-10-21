-- Add credit_due column to customers to track outstanding amounts owed by customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_due numeric(14,2) DEFAULT 0 NOT NULL;
