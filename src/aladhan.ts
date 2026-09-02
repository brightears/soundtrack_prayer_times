// Prayer Times API client
// Supports multiple providers: Aladhan, PrayCalendar
// Default: Aladhan (https://aladhan.com/prayer-times-api)

const ALADHAN_BASE_URL = "https://api.aladhan.com/v1";
const PRAYCALENDAR_BASE_URL = "https://pray.ahmedelywa.com";

export interface PrayerTimings {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

// The 5 prayers we care about for pausing music
export const PRAYER_NAMES = [
  "Fajr",
  "Dhuhr",
  "Asr",
  "Maghrib",
  "Isha",
] as const;

export type PrayerName = (typeof PRAYER_NAMES)[number];

// Calculation methods, keyed by the id Aladhan actually uses (GET /v1/methods).
// The id is sent straight to the API, so a wrong key here silently computes with a
// different authority: this map was once off by one for ids >= 7 (migration 008).
export const CALCULATION_METHODS: Record<number, string> = {
  0: "Shia Ithna-Ashari, Leva Institute, Qum",
  1: "University of Islamic Sciences, Karachi",
  2: "Islamic Society of North America (ISNA)",
  3: "Muslim World League",
  4: "Umm Al-Qura University, Makkah",
  5: "Egyptian General Authority of Survey",
  7: "Institute of Geophysics, University of Tehran",
  8: "Gulf Region",
  9: "Kuwait",
  10: "Qatar",
  11: "Majlis Ugama Islam Singapura, Singapore",
  12: "Union Organization Islamic de France",
  13: "Diyanet Isleri Baskanligi, Turkey",
  14: "Spiritual Administration of Muslims of Russia",
  15: "Moonsighting Committee Worldwide",
  16: "Dubai",
  17: "Jabatan Kemajuan Islam Malaysia (JAKIM)",
  18: "Tunisia",
  19: "Algeria",
  20: "Kementerian Agama Republik Indonesia (KEMENAG)",
  21: "Morocco",
  22: "Comunidade Islamica de Lisboa",
  23: "Ministry of Awqaf, Islamic Affairs and Holy Places, Jordan",
};

interface AladhanTimingsResponse {
  code: number;
  status: string;
  data: {
    timings: Record<string, string>;
    date: {
      readable: string;
      gregorian: { date: string };
      hijri: { date: string };
    };
  };
}

interface AladhanCalendarResponse {
  code: number;
  status: string;
  data: Array<{
    timings: Record<string, string>;
    date: {
      gregorian: { date: string };
    };
  }>;
}

// Strip timezone suffix from time strings (e.g. "04:32 (WIB)" -> "04:32")
function cleanTime(time: string): string {
  return time.replace(/\s*\(.*\)$/, "").trim();
}

function extractTimings(raw: Record<string, string>): PrayerTimings {
  return {
    Fajr: cleanTime(raw.Fajr),
    Sunrise: cleanTime(raw.Sunrise),
    Dhuhr: cleanTime(raw.Dhuhr),
    Asr: cleanTime(raw.Asr),
    Maghrib: cleanTime(raw.Maghrib),
    Isha: cleanTime(raw.Isha),
  };
}

async function fetchWithRetry(
  url: string,
  retries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(
        `Aladhan API error (${response.status}): ${await response.text()}`
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    // Wait before retry: 1s, 2s, 4s
    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastError ?? new Error("Aladhan API request failed");
}

// Available prayer time sources
export const PRAYER_SOURCES: Record<string, string> = {
  aladhan: "Aladhan (aladhan.com)",
  praycalendar: "PrayCalendar (pray.ahmedelywa.com)",
};

export interface FetchTimingsParams {
  city: string;
  country: string;
  method: number;
  school: number; // 0=Shafi'i, 1=Hanafi
  date?: Date;
  source?: string; // prayer time provider (default: aladhan)
  latitude?: number | null; // when set, calculate from exact coordinates
  longitude?: number | null;
  timezone?: string; // IANA tz, pinned on Aladhan's output when using coordinates
}

export async function fetchTimings(
  params: FetchTimingsParams
): Promise<PrayerTimings> {
  const source = params.source || "aladhan";

  switch (source) {
    case "praycalendar":
      return fetchFromPrayCalendar(params);
    case "aladhan":
    default:
      return fetchFromAladhan(params);
  }
}

// ── Aladhan provider ────────────────────────────────────────────────────

async function fetchFromAladhan(
  params: FetchTimingsParams
): Promise<PrayerTimings> {
  const date = params.date ?? new Date();
  const dateStr = `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;

  // Prefer exact coordinates when available. Aladhan's city-name geocoder
  // silently resolves some towns to the wrong location (e.g. "Umluj, Saudi
  // Arabia" → a point ~31 min of solar time east), so coordinates are the
  // accurate, deterministic path. Falls back to city/country lookup otherwise.
  const hasCoords =
    typeof params.latitude === "number" &&
    Number.isFinite(params.latitude) &&
    typeof params.longitude === "number" &&
    Number.isFinite(params.longitude);

  let url: URL;
  if (hasCoords) {
    url = new URL(`${ALADHAN_BASE_URL}/timings/${dateStr}`);
    url.searchParams.set("latitude", String(params.latitude));
    url.searchParams.set("longitude", String(params.longitude));
    // Pin the output timezone to the zone's stored tz so the returned HH:MM
    // matches how the scheduler converts it back to UTC.
    if (params.timezone) url.searchParams.set("timezonestring", params.timezone);
  } else {
    url = new URL(`${ALADHAN_BASE_URL}/timingsByCity/${dateStr}`);
    url.searchParams.set("city", params.city);
    url.searchParams.set("country", params.country);
  }
  url.searchParams.set("method", String(params.method));
  url.searchParams.set("school", String(params.school));

  const response = await fetchWithRetry(url.toString());
  const json = (await response.json()) as AladhanTimingsResponse;

  if (json.code !== 200) {
    throw new Error(`Aladhan API returned status ${json.code}: ${json.status}`);
  }

  return extractTimings(json.data.timings);
}

// ── PrayCalendar provider ───────────────────────────────────────────────

interface PrayCalendarResponse {
  date?: unknown;
  // Current API shape: capitalised keys under `timings`.
  timings?: Record<string, string>;
  // Legacy shape this client was originally written against.
  prayer_times?: {
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
  };
}

// Map Aladhan method ids to PrayCalendar method names. Note PrayCalendar appears to
// ignore the method parameter entirely (same times for any name), so Aladhan should
// remain the recommended source for method-sensitive venues.
const PRAYCALENDAR_METHODS: Record<number, string> = {
  0: "Shia",
  1: "Karachi",
  2: "ISNA",
  3: "MWL",
  4: "Makkah",
  5: "Egypt",
  7: "Tehran",
  8: "Gulf",
  9: "Kuwait",
  10: "Qatar",
  11: "Singapore",
  12: "France",
  13: "Turkey",
  14: "Russia",
  15: "MWL",  // Moonsighting Committee: no PrayCalendar equivalent
  16: "Gulf", // Dubai: closest PrayCalendar method
  17: "JAKIM",
  18: "Tunisia",
  19: "Algeria",
  20: "KEMENAG",
  21: "Morocco",
  22: "Portugal",
  23: "Jordan",
};

async function fetchFromPrayCalendar(
  params: FetchTimingsParams
): Promise<PrayerTimings> {
  const address = `${params.city}, ${params.country}`;
  const method = PRAYCALENDAR_METHODS[params.method] || "MWL";

  const url = new URL(`${PRAYCALENDAR_BASE_URL}/api/prayer-times.json`);
  url.searchParams.set("address", address);
  url.searchParams.set("method", method);

  const response = await fetchWithRetry(url.toString());
  const json = (await response.json()) as PrayCalendarResponse;

  if (json.timings) {
    return extractTimings(json.timings);
  }
  const legacy = json.prayer_times;
  if (!legacy) {
    throw new Error("PrayCalendar API returned no prayer times");
  }
  return {
    Fajr: legacy.fajr,
    Sunrise: legacy.sunrise,
    Dhuhr: legacy.dhuhr,
    Asr: legacy.asr,
    Maghrib: legacy.maghrib,
    Isha: legacy.isha,
  };
}

// ── Month calendar (Aladhan only) ───────────────────────────────────────

export interface FetchMonthParams {
  year: number;
  month: number; // 1-12
  city: string;
  country: string;
  method: number;
  school: number;
}

export async function fetchMonthCalendar(
  params: FetchMonthParams
): Promise<Array<{ date: string; timings: PrayerTimings }>> {
  const url = new URL(
    `${ALADHAN_BASE_URL}/calendarByCity/${params.year}/${params.month}`
  );
  url.searchParams.set("city", params.city);
  url.searchParams.set("country", params.country);
  url.searchParams.set("method", String(params.method));
  url.searchParams.set("school", String(params.school));

  const response = await fetchWithRetry(url.toString());
  const json = (await response.json()) as AladhanCalendarResponse;

  if (json.code !== 200) {
    throw new Error(`Aladhan API returned status ${json.code}: ${json.status}`);
  }

  return json.data.map((day) => ({
    date: day.date.gregorian.date,
    timings: extractTimings(day.timings),
  }));
}
