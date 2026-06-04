// City/country → latitude/longitude via OpenStreetMap Nominatim.
//
// Used at zone-save time so prayer times can be calculated from exact
// coordinates instead of relying on Aladhan's city-name geocoder, which
// silently resolves some towns to the wrong location (e.g. "Umluj, Saudi
// Arabia" lands ~31 minutes of solar time east of the real town).

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// Nominatim's usage policy requires a descriptive User-Agent identifying the app.
const USER_AGENT = "soundtrack-prayer-times/1.0 (BMAsia prayer-times scheduler)";

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
}

async function search(
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
  if (!res.ok) {
    throw new Error(`Geocoding service error (${res.status})`);
  }

  const hits = (await res.json()) as NominatimHit[];
  if (!Array.isArray(hits) || hits.length === 0) return null;

  const top = hits[0];
  const latitude = Number(top.lat);
  const longitude = Number(top.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude, displayName: top.display_name };
}

export async function geocodeCity(
  city: string,
  country: string
): Promise<GeocodeResult | null> {
  const cleanCity = (city || "").trim();
  const cleanCountry = (country || "").trim();
  if (!cleanCity) return null;

  // Structured query is most precise — resolves the town itself rather than a
  // region/governorate centroid.
  const structured = await search({ city: cleanCity, country: cleanCountry });
  if (structured) return structured;

  // Fall back to a free-form query if the structured one finds nothing.
  return search({ q: [cleanCity, cleanCountry].filter(Boolean).join(", ") });
}
