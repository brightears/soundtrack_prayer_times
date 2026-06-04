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

// Parse a latitude/longitude form value into a number, or null when blank/invalid.
export function parseCoord(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
