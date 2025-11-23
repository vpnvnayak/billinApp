-- Create a trigger so any INSERT into system_logs emits a NOTIFY on channel system_logs_channel
-- This ensures inserts performed outside of the Node logger (manual SQL, other scripts) also trigger live updates.

-- Create or replace the notify function
CREATE OR REPLACE FUNCTION notify_system_logs_insert() RETURNS trigger AS $$
DECLARE
  payload text;
BEGIN
  -- Convert NEW row to JSON text and send as payload
  payload := row_to_json(NEW)::text;
  PERFORM pg_notify('system_logs_channel', payload);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop any existing trigger and create a new one
DROP TRIGGER IF EXISTS trg_notify_system_logs_insert ON system_logs;
CREATE TRIGGER trg_notify_system_logs_insert
AFTER INSERT ON system_logs
FOR EACH ROW EXECUTE FUNCTION notify_system_logs_insert();

-- Grant execute on function to public (optional; adjust according to your security model)
-- GRANT EXECUTE ON FUNCTION notify_system_logs_insert() TO public;
