-- Add prayer time source selection per zone (default: aladhan)
ALTER TABLE zone_configs
  ADD COLUMN prayer_source TEXT NOT NULL DEFAULT 'aladhan';
