import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { query } from "../db.js";
import { CALCULATION_METHODS, PRAYER_SOURCES } from "../aladhan.js";
import { getSchedulerStatus, refreshZone } from "../scheduler.js";
import { collectPrayers, collectDurations, collectAdhanPrayers, parseCoord } from "../shared.js";
import { attachTodayTimings, type DashboardZoneRow } from "../today-times.js";
import { resolveZoneCoordinates } from "../geocode.js";

const router = Router();

// ── Dashboard ─────────────────────────────────────────────────────────────

router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await query<DashboardZoneRow>(
      `SELECT zc.*,
        (SELECT row_to_json(al.*) FROM action_log al
         WHERE al.zone_config_id = zc.id
         ORDER BY al.created_at DESC LIMIT 1) as last_action
       FROM zone_configs zc
       ORDER BY zc.created_at DESC`
    );
    const zones = result.rows;
    await attachTodayTimings(zones);

    const status = getSchedulerStatus();

    res.render("dashboard", {
      zones,
      schedulerStatus: status,
      currentPage: "dashboard",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Error: ${msg}`);
  }
});

// ── Add Zone Form ─────────────────────────────────────────────────────────

router.get("/zones/new", (_req: Request, res: Response) => {
  res.render("zone-form", {
    zone: null,
    methods: CALCULATION_METHODS,
    prayerSources: PRAYER_SOURCES,
    error: null,
    currentPage: "zones-new",
  });
});

// ── Edit Zone Form ────────────────────────────────────────────────────────

router.get("/zones/:id/edit", async (req: Request, res: Response) => {
  try {
    const result = await query("SELECT * FROM zone_configs WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rows.length === 0) {
      res.status(404).send("Zone config not found");
      return;
    }
    res.render("zone-form", {
      zone: result.rows[0],
      methods: CALCULATION_METHODS,
    prayerSources: PRAYER_SOURCES,
      error: null,
      currentPage: "zones-new",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Error: ${msg}`);
  }
});

// ── Create Zone (form POST) ───────────────────────────────────────────────

router.post("/zones/create", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const prayers = collectPrayers(b);
    if (!prayers) {
      res.render("zone-form", {
        zone: null,
        methods: CALCULATION_METHODS,
    prayerSources: PRAYER_SOURCES,
        error: "Select at least one prayer.",
        currentPage: "zones-new",
      });
      return;
    }

    const durations = collectDurations(b);
    const adhanPrayers = collectAdhanPrayers(b);
    // Fill coordinates when left blank so accuracy doesn't depend on remembering
    // to click "Look up from city".
    const coords = await resolveZoneCoordinates({
      latitude: parseCoord(b.latitude),
      longitude: parseCoord(b.longitude),
      city: b.city,
      country: b.country,
    });
    const result = await query(
      `INSERT INTO zone_configs
       (account_id, account_name, location_id, location_name, zone_id, zone_name,
        city, country, latitude, longitude, timezone, method, asr_school,
        prayers, pause_offset_minutes, pause_durations, mode, enabled,
        adhan_enabled, adhan_source_id, adhan_lead_minutes, default_source_id,
        prayer_source, adhan_prayers)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING *`,
      [
        b.account_id,
        b.account_name,
        b.location_id,
        b.location_name,
        b.zone_id,
        b.zone_name,
        b.city,
        b.country,
        coords.latitude,
        coords.longitude,
        b.timezone,
        Number(b.method),
        Number(b.asr_school),
        prayers,
        Number(b.pause_offset_minutes) || 0,
        JSON.stringify(durations),
        b.mode || "year-round",
        b.enabled !== "false",
        b.adhan_enabled === "true",
        b.adhan_source_id || null,
        Number(b.adhan_lead_minutes) || 5,
        b.default_source_id || null,
        b.prayer_source || "aladhan",
        adhanPrayers,
      ]
    );

    const config = result.rows[0];
    if (config.enabled) {
      await refreshZone(config.id);
    }

    res.redirect("/");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.render("zone-form", {
      zone: null,
      methods: CALCULATION_METHODS,
    prayerSources: PRAYER_SOURCES,
      error: msg,
      currentPage: "zones-new",
    });
  }
});

// ── Update Zone (form POST) ──────────────────────────────────────────────

router.post("/zones/:id/update", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const prayers = collectPrayers(b);
    if (!prayers) {
      const existing = await query("SELECT * FROM zone_configs WHERE id = $1", [
        req.params.id,
      ]);
      res.render("zone-form", {
        zone: existing.rows[0] ?? null,
        methods: CALCULATION_METHODS,
    prayerSources: PRAYER_SOURCES,
        error: "Select at least one prayer.",
        currentPage: "zones-new",
      });
      return;
    }

    const durations = collectDurations(b);
    const adhanPrayers = collectAdhanPrayers(b);
    const coords = await resolveZoneCoordinates({
      latitude: parseCoord(b.latitude),
      longitude: parseCoord(b.longitude),
      city: b.city,
      country: b.country,
    });
    const result = await query(
      `UPDATE zone_configs SET
        account_id = $1, account_name = $2,
        location_id = $3, location_name = $4,
        zone_id = $5, zone_name = $6,
        city = $7, country = $8, latitude = $9, longitude = $10,
        timezone = $11, method = $12, asr_school = $13,
        prayers = $14, pause_offset_minutes = $15, pause_durations = $16,
        mode = $17, enabled = $18,
        adhan_enabled = $19, adhan_source_id = $20,
        adhan_lead_minutes = $21, default_source_id = $22,
        prayer_source = $23, adhan_prayers = $24,
        updated_at = NOW()
       WHERE id = $25 RETURNING *`,
      [
        b.account_id,
        b.account_name,
        b.location_id,
        b.location_name,
        b.zone_id,
        b.zone_name,
        b.city,
        b.country,
        coords.latitude,
        coords.longitude,
        b.timezone,
        Number(b.method),
        Number(b.asr_school),
        prayers,
        Number(b.pause_offset_minutes) || 0,
        JSON.stringify(durations),
        b.mode || "year-round",
        b.enabled !== "false",
        b.adhan_enabled === "true",
        b.adhan_source_id || null,
        Number(b.adhan_lead_minutes) || 5,
        b.default_source_id || null,
        b.prayer_source || "aladhan",
        adhanPrayers,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      res.status(404).send("Zone config not found");
      return;
    }

    await refreshZone(result.rows[0].id);
    res.redirect("/");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const existing = await query("SELECT * FROM zone_configs WHERE id = $1", [
      req.params.id,
    ]);
    res.render("zone-form", {
      zone: existing.rows[0] ?? null,
      methods: CALCULATION_METHODS,
    prayerSources: PRAYER_SOURCES,
      error: msg,
      currentPage: "zones-new",
    });
  }
});

// ── Activity Log ──────────────────────────────────────────────────────────

router.get("/log", async (req: Request, res: Response) => {
  try {
    const filters = {
      zone: typeof req.query.zone === "string" ? req.query.zone.trim() : "",
      account: typeof req.query.account === "string" ? req.query.account.trim() : "",
      prayer: typeof req.query.prayer === "string" ? req.query.prayer.trim() : "",
      start: typeof req.query.start === "string" ? req.query.start.trim() : "",
      end: typeof req.query.end === "string" ? req.query.end.trim() : "",
    };

    const where: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (filters.zone) {
      where.push(`zc.zone_name ILIKE $${p++}`);
      params.push(`%${filters.zone}%`);
    }
    if (filters.account) {
      where.push(`zc.account_name ILIKE $${p++}`);
      params.push(`%${filters.account}%`);
    }
    if (filters.prayer) {
      where.push(`al.prayer = $${p++}`);
      params.push(filters.prayer);
    }
    if (filters.start) {
      where.push(`al.executed_at >= $${p++}`);
      params.push(filters.start);
    }
    if (filters.end) {
      where.push(`al.executed_at < ($${p++}::timestamp + INTERVAL '1 day')`);
      params.push(filters.end);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const result = await query(
      `SELECT al.*, zc.zone_name, zc.account_name, zc.timezone AS zone_timezone
       FROM action_log al
       JOIN zone_configs zc ON zc.id = al.zone_config_id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT 500`,
      params
    );

    // Distinct values for dropdowns
    const accounts = await query<{ account_name: string }>(
      `SELECT DISTINCT account_name FROM zone_configs ORDER BY account_name`
    );
    const zones = await query<{ zone_name: string }>(
      `SELECT DISTINCT zone_name FROM zone_configs ORDER BY zone_name`
    );

    res.render("log", {
      logs: result.rows,
      filters,
      accountOptions: accounts.rows.map((r) => r.account_name),
      zoneOptions: zones.rows.map((r) => r.zone_name),
      prayerOptions: ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"],
      currentPage: "log",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Error: ${msg}`);
  }
});

// ── Customer Management ──────────────────────────────────────────────────

router.get("/customers", async (_req: Request, res: Response) => {
  try {
    const result = await query(
      "SELECT * FROM customers ORDER BY created_at DESC"
    );
    res.render("customers", { customers: result.rows, currentPage: "customers" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Error: ${msg}`);
  }
});

router.get("/customers/new", (_req: Request, res: Response) => {
  res.render("customer-form", {
    customer: null,
    error: null,
    portalUrl: null,
    currentPage: "customers",
  });
});

router.get("/customers/:id/edit", async (req: Request, res: Response) => {
  try {
    const result = await query("SELECT * FROM customers WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rows.length === 0) {
      res.status(404).send("Customer not found");
      return;
    }
    const customer = result.rows[0];
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.render("customer-form", {
      customer,
      error: null,
      portalUrl: `${baseUrl}/p/${customer.token}`,
      currentPage: "customers",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Error: ${msg}`);
  }
});

router.post("/customers/create", async (req: Request, res: Response) => {
  try {
    const { name, account_id, account_name, enabled } = req.body;
    if (!name || !account_id) {
      res.render("customer-form", {
        customer: null,
        error: "Customer name and account are required.",
        portalUrl: null,
        currentPage: "customers",
      });
      return;
    }

    const token = randomBytes(32).toString("hex");
    const result = await query(
      `INSERT INTO customers (token, name, account_id, account_name, enabled)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [token, name, account_id, account_name || "", enabled !== "false"]
    );

    const customer = result.rows[0];
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.render("customer-form", {
      customer,
      error: null,
      portalUrl: `${baseUrl}/p/${customer.token}`,
      currentPage: "customers",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.render("customer-form", {
      customer: null,
      error: msg,
      portalUrl: null,
      currentPage: "customers",
    });
  }
});

router.post("/customers/:id/update", async (req: Request, res: Response) => {
  try {
    const { name, enabled } = req.body;
    const result = await query(
      `UPDATE customers SET name = $1, enabled = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [name, enabled !== "false", req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).send("Customer not found");
      return;
    }
    res.redirect("/customers");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const existing = await query("SELECT * FROM customers WHERE id = $1", [
      req.params.id,
    ]);
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const customer = existing.rows[0] ?? null;
    res.render("customer-form", {
      customer,
      error: msg,
      portalUrl: customer ? `${baseUrl}/p/${customer.token}` : null,
      currentPage: "customers",
    });
  }
});

export default router;
