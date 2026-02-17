import { Router, type Request, type Response } from "express";
import { query } from "../db.js";
import { CALCULATION_METHODS } from "../aladhan.js";
import { getSchedulerStatus, refreshZone } from "../scheduler.js";

const router = Router();

// ── Dashboard ─────────────────────────────────────────────────────────────

router.get("/", async (_req: Request, res: Response) => {
  try {
    const zones = await query(
      `SELECT zc.*,
        (SELECT row_to_json(al.*) FROM action_log al
         WHERE al.zone_config_id = zc.id
         ORDER BY al.created_at DESC LIMIT 1) as last_action
       FROM zone_configs zc
       ORDER BY zc.created_at DESC`
    );

    const status = getSchedulerStatus();

    res.render("dashboard", {
      zones: zones.rows,
      schedulerStatus: status,
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
    error: null,
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
      error: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Error: ${msg}`);
  }
});

// ── Create Zone (form POST) ───────────────────────────────────────────────

function collectPrayers(body: Record<string, string>): string {
  const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  return prayers.filter((p) => body[`prayer_${p}`]).join(",");
}

router.post("/zones/create", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const prayers = collectPrayers(b);
    if (!prayers) {
      res.render("zone-form", {
        zone: null,
        methods: CALCULATION_METHODS,
        error: "Select at least one prayer.",
      });
      return;
    }

    const result = await query(
      `INSERT INTO zone_configs
       (account_id, account_name, location_id, location_name, zone_id, zone_name,
        city, country, timezone, method, asr_school,
        prayers, pause_offset_minutes, pause_duration_minutes, mode, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
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
        b.timezone,
        Number(b.method),
        Number(b.asr_school),
        prayers,
        Number(b.pause_offset_minutes) || 0,
        Number(b.pause_duration_minutes) || 20,
        b.mode || "year-round",
        b.enabled !== "false",
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
      error: msg,
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
        error: "Select at least one prayer.",
      });
      return;
    }

    const result = await query(
      `UPDATE zone_configs SET
        city = $1, country = $2, timezone = $3, method = $4, asr_school = $5,
        prayers = $6, pause_offset_minutes = $7, pause_duration_minutes = $8,
        mode = $9, enabled = $10, updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [
        b.city,
        b.country,
        b.timezone,
        Number(b.method),
        Number(b.asr_school),
        prayers,
        Number(b.pause_offset_minutes) || 0,
        Number(b.pause_duration_minutes) || 20,
        b.mode || "year-round",
        b.enabled !== "false",
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
      error: msg,
    });
  }
});

// ── Activity Log ──────────────────────────────────────────────────────────

router.get("/log", async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT al.*, zc.zone_name, zc.account_name
       FROM action_log al
       JOIN zone_configs zc ON zc.id = al.zone_config_id
       ORDER BY al.created_at DESC
       LIMIT 100`
    );
    res.render("log", { logs: result.rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Error: ${msg}`);
  }
});

export default router;
