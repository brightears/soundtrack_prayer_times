-- Add per-prayer pause durations (replaces single pause_duration_minutes)
ALTER TABLE zone_configs
  ADD COLUMN pause_durations JSONB NOT NULL
  DEFAULT '{"Fajr":15,"Dhuhr":20,"Asr":15,"Maghrib":15,"Isha":20}';

-- Migrate existing data: apply old single value to all prayers
UPDATE zone_configs
SET pause_durations = jsonb_build_object(
  'Fajr', pause_duration_minutes,
  'Dhuhr', pause_duration_minutes,
  'Asr', pause_duration_minutes,
  'Maghrib', pause_duration_minutes,
  'Isha', pause_duration_minutes
);

-- Drop old column
ALTER TABLE zone_configs DROP COLUMN pause_duration_minutes;
