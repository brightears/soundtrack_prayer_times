// City/country → latitude/longitude.
//
// Prayer times are calculated from coordinates because Aladhan's city-name
// geocoder silently resolves some towns to the wrong location (e.g. "Umluj,
// Saudi Arabia" lands ~31 minutes of solar time east of the real town).
//
// Two providers, tried in order:
//   1. Open-Meteo — free, no key, built for high request volume. Primary because
//      OpenStreetMap rate-limits/blocks shared datacenter IPs like Render's, which
//      made the "Look up from city" button fail after the first zone.
//   2. OpenStreetMap Nominatim — fallback; supports a structured city+country query.
// Results are cached in-process so adding several zones at the same property does
// not re-hit a provider at all.

import { query } from "./db.js";

const OPEN_METEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// Nominatim's usage policy requires a descriptive User-Agent identifying the app.
const USER_AGENT = "soundtrack-prayer-times/1.0 (BMAsia prayer-times scheduler)";

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
  provider: string;
}

const cache = new Map<string, GeocodeResult>();
const cacheKey = (city: string, country: string) =>
  `${city.trim().toLowerCase()}|${country.trim().toLowerCase()}`;

function sameCountry(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/^the\s+/, "");
  return norm(a) === norm(b);
}

interface OpenMeteoHit {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
}

// Open-Meteo has no country filter, so ask for several matches and prefer the one
// in the requested country. If a country was given and nothing matches, return null
// so the caller falls through to Nominatim rather than guessing a wrong country.
async function fromOpenMeteo(
  city: string,
  country: string
): Promise<GeocodeResult | null> {
  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("name", city);
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo error (${res.status})`);

  const json = (await res.json()) as { results?: OpenMeteoHit[] };
  const hits = json.results ?? [];
  if (hits.length === 0) return null;

  const hit = country
    ? hits.find((h) => h.country && sameCountry(h.country, country))
    : hits[0];
  if (!hit) return null;
  if (!Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) return null;

  return {
    latitude: hit.latitude,
    longitude: hit.longitude,
    displayName: [hit.name, hit.admin1, hit.country].filter(Boolean).join(", "),
    provider: "open-meteo",
  };
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
}

async function nominatimSearch(
  params: Record<string, string>
): Promise<GeocodeResult | null> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
  });
  if (!res.ok) throw new Error(`OpenStreetMap error (${res.status})`);

  const hits = (await res.json()) as NominatimHit[];
  if (!Array.isArray(hits) || hits.length === 0) return null;

  const latitude = Number(hits[0].lat);
  const longitude = Number(hits[0].lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    latitude,
    longitude,
    displayName: hits[0].display_name,
    provider: "openstreetmap",
  };
}

async function fromNominatim(
  city: string,
  country: string
): Promise<GeocodeResult | null> {
  // Structured query first — resolves the town itself rather than a region centroid.
  const structured = await nominatimSearch({ city, country });
  if (structured) return structured;
  return nominatimSearch({ q: [city, country].filter(Boolean).join(", ") });
}

export async function geocodeCity(
  city: string,
  country: string
): Promise<GeocodeResult | null> {
  const cleanCity = (city || "").trim();
  const cleanCountry = (country || "").trim();
  if (!cleanCity) return null;

  const key = cacheKey(cleanCity, cleanCountry);
  const cached = cache.get(key);
  if (cached) return cached;

  const errors: string[] = [];
  for (const provider of [fromOpenMeteo, fromNominatim]) {
    try {
      const hit = await provider(cleanCity, cleanCountry);
      if (hit) {
        if (cache.size > 500) cache.clear();
        cache.set(key, hit);
        return hit;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Every provider failed outright (vs. simply not knowing the place) — surface it
  // so the UI can say "try again" instead of "city not found".
  if (errors.length === 2) {
    throw new Error(`Geocoding services unavailable: ${errors.join("; ")}`);
  }
  return null;
}

/**
 * Coordinates to store for a zone. Explicit values always win. When blank, reuse a
 * sibling zone already configured for the same city/country (instant, no API call —
 * the common case when adding several zones at one property), otherwise geocode.
 * Returns nulls if nothing can be resolved: the scheduler then falls back to the
 * city-name lookup exactly as before, so a save never fails over geocoding.
 */
export async function resolveZoneCoordinates(input: {
  latitude: number | null;
  longitude: number | null;
  city: string;
  country: string;
}): Promise<{ latitude: number | null; longitude: number | null }> {
  if (input.latitude !== null && input.longitude !== null) {
    return { latitude: input.latitude, longitude: input.longitude };
  }

  const city = (input.city || "").trim();
  const country = (input.country || "").trim();
  if (!city) return { latitude: null, longitude: null };

  try {
    const sibling = await query<{ latitude: number; longitude: number }>(
      `SELECT latitude, longitude FROM zone_configs
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
          AND lower(trim(city)) = lower($1) AND lower(trim(coalesce(country,''))) = lower($2)
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1`,
      [city, country]
    );
    if (sibling.rows[0]) {
      return {
        latitude: sibling.rows[0].latitude,
        longitude: sibling.rows[0].longitude,
      };
    }
  } catch {
    // fall through to geocoding
  }

  try {
    const hit = await geocodeCity(city, country);
    if (hit) return { latitude: hit.latitude, longitude: hit.longitude };
  } catch {
    // geocoding unavailable — leave blank, scheduler falls back to city lookup
  }

  return { latitude: null, longitude: null };
}
