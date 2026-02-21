// Shared helpers used by both admin and portal routes

export const DEFAULT_DURATIONS: Record<string, number> = {
  Fajr: 15, Dhuhr: 20, Asr: 15, Maghrib: 15, Isha: 20,
};

export function collectPrayers(body: Record<string, string>): string {
  const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  return prayers.filter((p) => body[`prayer_${p}`]).join(",");
}

export function collectDurations(body: Record<string, string>): Record<string, number> {
  const durations: Record<string, number> = {};
  for (const prayer of ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]) {
    durations[prayer] = Number(body[`duration_${prayer}`]) || DEFAULT_DURATIONS[prayer];
  }
  return durations;
}
