-- Zone prayer time configurations
CREATE TABLE IF NOT EXISTS zone_configs (
  id            SERIAL PRIMARY KEY,
  account_id    TEXT NOT NULL,
  account_name  TEXT NOT NULL,
  location_id   TEXT NOT NULL,
  location_name TEXT NOT NULL,
  zone_id       TEXT NOT NULL UNIQUE,
  zone_name     TEXT NOT NULL,
  city          TEXT NOT NULL,
  country       TEXT NOT NULL,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  timezone      TEXT NOT NULL,
  method        INTEGER NOT NULL DEFAULT 4,
  asr_school    INTEGER NOT NULL DEFAULT 0,
  prayers       TEXT NOT NULL DEFAULT 'Fajr,Dhuhr,Asr,Maghrib,Isha',
  pause_offset_minutes   INTEGER NOT NULL DEFAULT 0,
  pause_duration_minutes INTEGER NOT NULL DEFAULT 20,
  mode          TEXT NOT NULL DEFAULT 'year-round',
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cached daily prayer times
CREATE TABLE IF NOT EXISTS prayer_times_cache (
  id             SERIAL PRIMARY KEY,
  zone_config_id INTEGER NOT NULL REFERENCES zone_configs(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  timings        JSONB NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(zone_config_id, date)
);

-- Action log
CREATE TABLE IF NOT EXISTS action_log (
  id             SERIAL PRIMARY KEY,
  zone_config_id INTEGER NOT NULL REFERENCES zone_configs(id) ON DELETE CASCADE,
  zone_id        TEXT NOT NULL,
  action         TEXT NOT NULL,
  prayer         TEXT NOT NULL,
  scheduled_at   TIMESTAMPTZ NOT NULL,
  executed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success        BOOLEAN NOT NULL,
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast log queries
CREATE INDEX IF NOT EXISTS idx_action_log_zone_config ON action_log(zone_config_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prayer_cache_lookup ON prayer_times_cache(zone_config_id, date);
