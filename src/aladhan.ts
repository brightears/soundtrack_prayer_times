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

// Calculation methods supported by Aladhan
export const CALCULATION_METHODS: Record<number, string> = {
  0: "Shia Ithna-Ansari",
  1: "University of Islamic Sciences, Karachi",
  2: "Islamic Society of North America (ISNA)",
  3: "Muslim World League",
  4: "Umm Al-Qura University, Makkah",
  5: "Egyptian General Authority of Survey",
  7: "Gulf Region",
  8: "Kuwait",
  9: "Qatar",
  10: "Majlis Ugama Islam Singapura",
  11: "Union Organization Islamic de France",
  12: "Diyanet Isleri Baskanligi, Turkey",
  13: "Spiritual Administration of Muslims of Russia",
  14: "Institute of Geophysics, University of Tehran",
  15: "Shia: Leva Research Institute, Qum",
  16: "JAKIM (Malaysia)",
  17: "Tunisia",
  18: "Algeria",
  19: "KEMENAG (Indonesia)",
  20: "Morocco",
  21: "Comunidade Islamica de Lisboa",
  22: "Ministry of Awqaf, Islamic Affairs and Holy Places, Jordan",
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

  const url = new URL(`${ALADHAN_BASE_URL}/timingsByCity/${dateStr}`);
  url.searchParams.set("city", params.city);
  url.searchParams.set("country", params.country);
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
  date: string;
  prayer_times: {
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
  };
}

// Map Aladhan method numbers to PrayCalendar method names
const PRAYCALENDAR_METHODS: Record<number, string> = {
  0: "Shia", // closest match
  1: "Karachi",
  2: "ISNA",
  3: "MWL",
  4: "Makkah",
  5: "Egypt",
  7: "Gulf",
  8: "Kuwait",
  9: "Qatar",
  10: "Singapore",
  11: "France",
  12: "Turkey",
  13: "Russia",
  14: "Tehran",
  15: "Shia",
  16: "JAKIM",
  17: "Tunisia",
  18: "Algeria",
  19: "KEMENAG",
  20: "Morocco",
  21: "Portugal",
  22: "Jordan",
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

  if (!json.prayer_times) {
    throw new Error("PrayCalendar API returned no prayer times");
  }

  return {
    Fajr: json.prayer_times.fajr,
    Sunrise: json.prayer_times.sunrise,
    Dhuhr: json.prayer_times.dhuhr,
    Asr: json.prayer_times.asr,
    Maghrib: json.prayer_times.maghrib,
    Isha: json.prayer_times.isha,
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
