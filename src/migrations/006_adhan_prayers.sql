-- Per-prayer adhan selection: which prayers the call-to-prayer plays for.
ALTER TABLE zone_configs
  ADD COLUMN adhan_prayers TEXT NOT NULL DEFAULT 'Fajr,Dhuhr,Asr,Maghrib,Isha';

-- Backward-compat: a zone with adhan currently enabled plays the adhan for every
-- prayer it pauses for. Preserve that exactly by copying `prayers` (which may be a
-- subset like 'Maghrib'). The full-set DEFAULT only ever applies to future INSERTs
-- and to adhan-disabled rows (inert until adhan is turned on via the form).
UPDATE zone_configs
SET adhan_prayers = prayers
WHERE adhan_enabled = true;
