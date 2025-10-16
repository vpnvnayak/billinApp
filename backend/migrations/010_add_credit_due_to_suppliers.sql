-- 010_add_credit_due_to_suppliers.sql
-- Add credit_due column to suppliers to track amount owed to suppliers
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS credit_due numeric(14,2) DEFAULT 0;
