-- Add per-line computed amount columns so frontend-calculated values can be persisted
ALTER TABLE IF EXISTS purchase_items
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS after_discount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS discount_rs NUMERIC(12,2);
