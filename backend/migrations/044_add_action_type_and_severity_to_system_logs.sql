-- Add action_type and severity columns to system_logs for classification and filtering
ALTER TABLE system_logs
  ADD COLUMN IF NOT EXISTS action_type TEXT,
  ADD COLUMN IF NOT EXISTS severity TEXT;

-- Indexes to speed up common filters
CREATE INDEX IF NOT EXISTS system_logs_action_type_idx ON system_logs (action_type);
CREATE INDEX IF NOT EXISTS system_logs_severity_idx ON system_logs (severity);
