import cron from "node-cron";
import { query } from "./db.js";
import { graphql } from "./soundtrack.js";
import { PLAY, PAUSE } from "./queries.js";
import { fetchTimings, type PrayerName, PRAYER_NAMES } from "./aladhan.js";

interface ZoneConfig {
  id: number;
  zone_id: string;
  zone_name: string;
  city: string;
  country: string;
  timezone: string;
  method: number;
  asr_school: number;
  prayers: string;
  pause_offset_minutes: number;
  pause_duration_minutes: number;
  mode: string;
  enabled: boolean;
}

interface PrayerTimingsCache {
  Fajr: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

// Active timeouts per zone config ID
const activeTimeouts = new Map<number, NodeJS.Timeout[]>();

// Track the midnight cron task
let midnightTask: cron.ScheduledTask | null = null;

function parseTime(timeStr: string, timezone: string, date?: Date): Date {
  const now = date ?? new Date();
  const [hours, minutes] = timeStr.split(":").map(Number);

  // Create a date string in the zone's local date
  const localDateStr = now.toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
  const localDateTime = new Date(`${localDateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);

  // Convert from zone-local to UTC by computing the offset
  const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = now.toLocaleString("en-US", { timeZone: timezone });
  const offsetMs = new Date(utcStr).getTime() - new Date(tzStr).getTime();

  return new Date(localDateTime.getTime() + offsetMs);
}

function nowInTimezone(timezone: string): Date {
  // Returns the current UTC date, which we compare against parsed UTC times
  return new Date();
}

async function loadEnabledConfigs(): Promise<ZoneConfig[]> {
  const result = await query<ZoneConfig>(
    "SELECT * FROM zone_configs WHERE enabled = true"
  );
  return result.rows;
}

async function getCachedTimings(
  configId: number,
  date: string
): Promise<PrayerTimingsCache | null> {
  const result = await query<{ timings: PrayerTimingsCache }>(
    "SELECT timings FROM prayer_times_cache WHERE zone_config_id = $1 AND date = $2",
    [configId, date]
  );
  return result.rows[0]?.timings ?? null;
}

async function cacheTimings(
  configId: number,
  date: string,
  timings: PrayerTimingsCache
): Promise<void> {
  await query(
    `INSERT INTO prayer_times_cache (zone_config_id, date, timings)
     VALUES ($1, $2, $3)
     ON CONFLICT (zone_config_id, date)
     DO UPDATE SET timings = $3, fetched_at = NOW()`,
    [configId, date, JSON.stringify(timings)]
  );
}

async function logAction(
  configId: number,
  zoneId: string,
  action: string,
  prayer: string,
  scheduledAt: Date,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  await query(
    `INSERT INTO action_log (zone_config_id, zone_id, action, prayer, scheduled_at, success, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [configId, zoneId, action, prayer, scheduledAt, success, errorMessage ?? null]
  );
}

async function executeWithRetry(
  mutation: string,
  zoneId: string,
  retries: number = 3
): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await graphql(mutation, { soundZone: zoneId });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
  throw lastError;
}

function clearTimeouts(configId: number): void {
  const timeouts = activeTimeouts.get(configId);
  if (timeouts) {
    for (const t of timeouts) clearTimeout(t);
    activeTimeouts.delete(configId);
  }
}

async function scheduleZone(config: ZoneConfig): Promise<void> {
  clearTimeouts(config.id);

  const now = new Date();
  const localDateStr = now.toLocaleDateString("en-CA", {
    timeZone: config.timezone,
  });

  // Check if Ramadan-only mode should be active
  if (config.mode === "ramadan-only") {
    // For Ramadan-only mode, check if we're in Ramadan
    // Ramadan dates change yearly; for now, always schedule and let admin toggle enabled
    // TODO: Auto-detect Ramadan via Hijri calendar
  }

  // Fetch today's prayer times
  let timings: PrayerTimingsCache;
  try {
    const fetched = await fetchTimings({
      city: config.city,
      country: config.country,
      method: config.method,
      school: config.asr_school,
    });
    timings = {
      Fajr: fetched.Fajr,
      Dhuhr: fetched.Dhuhr,
      Asr: fetched.Asr,
      Maghrib: fetched.Maghrib,
      Isha: fetched.Isha,
    };
    await cacheTimings(config.id, localDateStr, timings);
  } catch (err) {
    console.error(
      `Failed to fetch prayer times for zone ${config.zone_name}: ${err}`
    );
    // Fall back to cached times
    const cached = await getCachedTimings(config.id, localDateStr);
    if (!cached) {
      // Try yesterday's cache
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toLocaleDateString("en-CA", {
        timeZone: config.timezone,
      });
      const yesterdayCache = await getCachedTimings(config.id, yesterdayStr);
      if (!yesterdayCache) {
        console.error(
          `No cached prayer times available for zone ${config.zone_name}. Skipping.`
        );
        return;
      }
      timings = yesterdayCache;
      console.warn(
        `Using yesterday's cached times for zone ${config.zone_name}`
      );
    } else {
      timings = cached;
    }
  }

  // Parse which prayers to pause for
  const enabledPrayers = config.prayers.split(",").map((p) => p.trim()) as PrayerName[];
  const timeouts: NodeJS.Timeout[] = [];

  for (const prayer of enabledPrayers) {
    if (!PRAYER_NAMES.includes(prayer)) continue;

    const prayerTimeStr = timings[prayer];
    if (!prayerTimeStr) continue;

    const prayerTime = parseTime(prayerTimeStr, config.timezone);
    const pauseTime = new Date(
      prayerTime.getTime() - config.pause_offset_minutes * 60_000
    );
    const resumeTime = new Date(
      prayerTime.getTime() + config.pause_duration_minutes * 60_000
    );

    const nowMs = now.getTime();

    // Schedule pause
    if (pauseTime.getTime() > nowMs) {
      const delayMs = pauseTime.getTime() - nowMs;
      const timeout = setTimeout(async () => {
        try {
          console.log(
            `Pausing zone ${config.zone_name} for ${prayer} prayer`
          );
          await executeWithRetry(PAUSE, config.zone_id);
          await logAction(
            config.id,
            config.zone_id,
            "pause",
            prayer,
            pauseTime,
            true
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `Failed to pause zone ${config.zone_name} for ${prayer}: ${msg}`
          );
          await logAction(
            config.id,
            config.zone_id,
            "pause",
            prayer,
            pauseTime,
            false,
            msg
          );
        }
      }, delayMs);
      timeouts.push(timeout);
    }

    // Schedule resume
    if (resumeTime.getTime() > nowMs) {
      const delayMs = resumeTime.getTime() - nowMs;
      const timeout = setTimeout(async () => {
        try {
          console.log(
            `Resuming zone ${config.zone_name} after ${prayer} prayer`
          );
          await executeWithRetry(PLAY, config.zone_id);
          await logAction(
            config.id,
            config.zone_id,
            "resume",
            prayer,
            resumeTime,
            true
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `Failed to resume zone ${config.zone_name} after ${prayer}: ${msg}`
          );
          await logAction(
            config.id,
            config.zone_id,
            "resume",
            prayer,
            resumeTime,
            false,
            msg
          );
        }
      }, delayMs);
      timeouts.push(timeout);
    }
  }

  activeTimeouts.set(config.id, timeouts);
  console.log(
    `Scheduled ${timeouts.length} actions for zone ${config.zone_name} (${enabledPrayers.join(", ")})`
  );
}

export async function refreshAllSchedules(): Promise<void> {
  console.log("Refreshing all prayer time schedules...");
  const configs = await loadEnabledConfigs();

  for (const config of configs) {
    try {
      await scheduleZone(config);
    } catch (err) {
      console.error(
        `Error scheduling zone ${config.zone_name}: ${err}`
      );
    }
  }

  console.log(`Scheduled ${configs.length} zone(s)`);
}

export async function refreshZone(configId: number): Promise<void> {
  const result = await query<ZoneConfig>(
    "SELECT * FROM zone_configs WHERE id = $1 AND enabled = true",
    [configId]
  );
  if (result.rows[0]) {
    await scheduleZone(result.rows[0]);
  } else {
    clearTimeouts(configId);
  }
}

export function startScheduler(): void {
  // Refresh all schedules now
  refreshAllSchedules().catch((err) =>
    console.error("Initial schedule refresh failed:", err)
  );

  // Refresh daily at midnight UTC (covers all timezones within a day)
  // Individual zone times are already timezone-aware via parseTime
  midnightTask = cron.schedule("0 0 * * *", () => {
    refreshAllSchedules().catch((err) =>
      console.error("Daily schedule refresh failed:", err)
    );
  });

  console.log("Scheduler started. Daily refresh at midnight UTC.");
}

export function stopScheduler(): void {
  if (midnightTask) {
    midnightTask.stop();
    midnightTask = null;
  }
  for (const [configId] of activeTimeouts) {
    clearTimeouts(configId);
  }
  console.log("Scheduler stopped.");
}

export function getSchedulerStatus(): {
  activeZones: number;
  activeTimeouts: number;
} {
  let totalTimeouts = 0;
  for (const timeouts of activeTimeouts.values()) {
    totalTimeouts += timeouts.length;
  }
  return {
    activeZones: activeTimeouts.size,
    activeTimeouts: totalTimeouts,
  };
}
