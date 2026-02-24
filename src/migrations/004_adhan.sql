-- Add call to prayer (adhan) support
ALTER TABLE zone_configs
  ADD COLUMN adhan_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN adhan_source_id TEXT,
  ADD COLUMN adhan_lead_minutes INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN default_source_id TEXT;
