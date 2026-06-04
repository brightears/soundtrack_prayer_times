// Attaches each zone's "today" prayer times (the values the scheduler calculated
// and cached for the zone's local date) to dashboard rows for display.
//
// Read-only and additive: this does NOT touch scheduling. The scheduler writes
// prayer_times_cache keyed by (zone_config_id, zone-local date); here we read the
// row matching each zone's current local date and expose it as `today_prayer_times`.

import { query } from "./db.js";

export interface DashboardZoneRow {
  id: number;
  timezone: string;
  prayers: string;
  today_prayer_times?: Record<string, string> | null;
  [key: string]: any;
}

/** Zone-local calendar date as YYYY-MM-DD — same derivation the scheduler uses as the cache key. */
function localDateStr(timezone: string, now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: timezone });
}

/**
 * Mutates the given rows, setting `today_prayer_times` to the cached timings the
 * scheduler calculated for each zone's local "today" (or null when none exist).
 * One batched query; a per-zone try/catch keeps a single bad timezone string from
 * breaking the whole dashboard.
 */
export async function attachTodayTimings(zones: DashboardZoneRow[]): Promise<void> {
  for (const z of zones) z.today_prayer_times = null;
  if (zones.length === 0) return;

  // Map each zone to its local date; skip (leave null) any with an invalid timezone.
  const localDateByZone = new Map<number, string>();
  for (const z of zones) {
    try {
      localDateByZone.set(z.id, localDateStr(z.timezone));
    } catch {
      // invalid timezone string — leave today_prayer_times = null for this zone
    }
  }
  if (localDateByZone.size === 0) return;

  const ids = [...localDateByZone.keys()];
  // Fetch a ±1-day window around the server (UTC) date — wide enough to contain
  // every zone's local "today" regardless of its timezone — then match precisely.
  const cached = await query<{
    zone_config_id: number;
    date: string;
    timings: Record<string, string>;
  }>(
    `SELECT zone_config_id, to_char(date, 'YYYY-MM-DD') AS date, timings
       FROM prayer_times_cache
      WHERE zone_config_id = ANY($1::int[])
        AND date BETWEEN (CURRENT_DATE - 1) AND (CURRENT_DATE + 1)`,
    [ids]
  );

  const byZoneAndDate = new Map<string, Record<string, string>>();
  for (const row of cached.rows) {
    byZoneAndDate.set(`${row.zone_config_id}|${row.date}`, row.timings);
  }

  for (const z of zones) {
    const localDate = localDateByZone.get(z.id);
    if (!localDate) continue;
    z.today_prayer_times = byZoneAndDate.get(`${z.id}|${localDate}`) ?? null;
  }
}
