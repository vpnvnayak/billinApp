-- Add expires_at to refresh_tokens for token expiry and rotation
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
