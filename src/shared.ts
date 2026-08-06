// Shared helpers used by both admin and portal routes

export const DEFAULT_DURATIONS: Record<string, number> = {
  Fajr: 15, Dhuhr: 20, Asr: 15, Maghrib: 15, Isha: 20,
};

// Safety cap: no single prayer pause can exceed this many minutes at runtime,
// regardless of what's stored in zone_configs.pause_durations. Accommodates
// longer Dhuhr windows for Jumu'ah while preventing absurd values from
// silencing a zone indefinitely (see 2026-04-19 Turtle Bay incident).
// Overridable via MAX_PAUSE_MINUTES env var for per-deployment tuning.
export const MAX_PAUSE_MINUTES: number = (() => {
  const raw = Number(process.env.MAX_PAUSE_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
})();

export function clampPauseDuration(raw: number | undefined, prayer: string): number {
  const fallback = DEFAULT_DURATIONS[prayer] ?? 20;
  const value = Number.isFinite(raw) && (raw as number) > 0 ? (raw as number) : fallback;
  return Math.min(value, MAX_PAUSE_MINUTES);
}

export function collectPrayers(body: Record<string, string>): string {
  const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  return prayers.filter((p) => body[`prayer_${p}`]).join(",");
}

// Which prayers the call-to-prayer (adhan) plays for. Distinct `adhan_prayer_`
// prefix so it doesn't collide with the pause checkboxes (`prayer_`) above.
export function collectAdhanPrayers(body: Record<string, string>): string {
  const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  return prayers.filter((p) => body[`adhan_prayer_${p}`]).join(",");
}

export function collectDurations(body: Record<string, string>): Record<string, number> {
  const durations: Record<string, number> = {};
  for (const prayer of ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]) {
    const raw = Number(body[`duration_${prayer}`]);
    durations[prayer] = clampPauseDuration(
      Number.isFinite(raw) && raw > 0 ? raw : undefined,
      prayer
    );
  }
  return durations;
}

// Upper bound on how early the adhan may start before a prayer. Generous enough for
// any call-to-prayer recording while preventing a typo from replacing a zone's music
// for hours.
export const MAX_ADHAN_LEAD_SECONDS = 1800; // 30 minutes
// Floor on the lead. The adhan callback may spend tens of seconds on API retries
// before it starts playback; a lead shorter than that could see the "play" land after
// the prayer pause has already fired, un-pausing the zone during the prayer.
export const MIN_ADHAN_LEAD_SECONDS = 15;
export const MAX_ADHAN_LEAD_MINUTES = 30;

// Total adhan lead in seconds, from the stored minutes + seconds pair. The adhan runs
// for exactly this long before the prayer pause, so it should match the track length.
// Clamped to [MIN, MAX]: a stored 0:00 becomes the minimum rather than silently
// expanding to some multi-minute default (which would loop and clip the track — the
// exact defect the seconds component exists to fix).
export function resolveAdhanLeadSeconds(
  minutes: unknown,
  seconds: unknown
): number {
  const m = Number(minutes);
  const s = Number(seconds);
  const total =
    (Number.isFinite(m) && m > 0 ? Math.floor(m) : 0) * 60 +
    (Number.isFinite(s) && s > 0 ? Math.floor(s) : 0);
  return Math.min(
    Math.max(total, MIN_ADHAN_LEAD_SECONDS),
    MAX_ADHAN_LEAD_SECONDS
  );
}

// Minutes component of a lead-time form field. Blank/absent keeps the historical
// 5-minute default, but an explicit 0 must survive — `Number(x) || 5` would turn a
// deliberate 0 m 45 s lead into 5 m 45 s.
export function parseLeadMinutes(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 5;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 5;
  return Math.min(Math.max(Math.floor(n), 0), MAX_ADHAN_LEAD_MINUTES);
}

// Seconds component of a lead-time form field, normalised to 0-59.
export function parseLeadSeconds(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 59);
}

// Parse a latitude/longitude form value into a number, or null when blank/invalid.
export function parseCoord(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
