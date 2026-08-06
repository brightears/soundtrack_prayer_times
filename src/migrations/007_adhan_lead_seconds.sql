-- Seconds component for the call-to-prayer lead time.
--
-- The adhan plays for exactly the lead time before the prayer pause begins, so the
-- lead must match the adhan track's length. Whole minutes can't express e.g. a 2:32
-- track: 2 min clips the tail, 3 min loops the playlist and clips that instead.
ALTER TABLE zone_configs
  ADD COLUMN adhan_lead_seconds INTEGER NOT NULL DEFAULT 0;
