import { Router, type Request, type Response } from "express";
import { query } from "../db.js";
import { CALCULATION_METHODS } from "../aladhan.js";
import { refreshZone } from "../scheduler.js";
import { portalAuth } from "../middleware/portal-auth.js";
import { collectPrayers, collectDurations } from "../shared.js";

const router = Router();

// All routes require valid portal token
router.use("/:token", portalAuth);

// ── Portal Dashboard ─────────────────────────────────────────────────────

router.get("/:token", async (req: Request, res: Response) => {
  try {
    const customer = req.customer!;
    const zones = await query(
      `SELECT zc.*,
        (SELECT row_to_json(al.*) FROM action_log al
         WHERE al.zone_config_id = zc.id
         ORDER BY al.created_at DESC LIMIT 1) as last_action
       FROM zone_configs zc
       WHERE zc.account_id = $1
       ORDER BY zc.created_at DESC`,
      [customer.account_id]
    );

    res.render("portal/dashboard", {
      zones: zones.rows,
      customer,
      basePath: `/p/${customer.token}`,
      currentPage: "dashboard",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Error: ${msg}`);
  }
});

// ── Add Zone Form ────────────────────────────────────────────────────────

router.get("/:token/zones/new", (req: Request, res: Response) => {
  const customer = req.customer!;
  res.render("portal/zone-form", {
    zone: null,
    customer,
    methods: CALCULATION_METHODS,
    error: null,
    basePath: `/p/${customer.token}`,
    currentPage: "zones-new",
  });
});

// ── Edit Zone Form ───────────────────────────────────────────────────────

router.get("/:token/zones/:id/edit", async (req: Request, res: Response) => {
  try {
    const customer = req.customer!;
    const result = await query(
      "SELECT * FROM zone_configs WHERE id = $1 AND account_id = $2",
      [req.params.id, customer.account_id]
    );
    if (result.rows.length === 0) {
      res.status(404).send("Not found");
      return;
    }
    res.render("portal/zone-form", {
      zone: result.rows[0],
      customer,
      methods: CALCULATION_METHODS,
      error: null,
      basePath: `/p/${customer.token}`,
      currentPage: "zones-new",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Error: ${msg}`);
  }
});

// ── Create Zone (form POST) ──────────────────────────────────────────────

router.post("/:token/zones/create", async (req: Request, res: Response) => {
  try {
    const customer = req.customer!;
    const b = req.body;
    const prayers = collectPrayers(b);
    if (!prayers) {
      res.render("portal/zone-form", {
        zone: null,
        customer,
        methods: CALCULATION_METHODS,
        error: "Select at least one prayer.",
        basePath: `/p/${customer.token}`,
        currentPage: "zones-new",
      });
      return;
    }

    const durations = collectDurations(b);
    const result = await query(
      `INSERT INTO zone_configs
       (account_id, account_name, location_id, location_name, zone_id, zone_name,
        city, country, timezone, method, asr_school,
        prayers, pause_offset_minutes, pause_durations, mode, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        customer.account_id,
        customer.account_name,
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
        JSON.stringify(durations),
        b.mode || "year-round",
        b.enabled !== "false",
      ]
    );

    const config = result.rows[0];
    if (config.enabled) {
      await refreshZone(config.id);
    }

    res.redirect(`/p/${customer.token}`);
  } catch (err) {
    const customer = req.customer!;
    const msg = err instanceof Error ? err.message : String(err);
    res.render("portal/zone-form", {
      zone: null,
      customer,
      methods: CALCULATION_METHODS,
      error: msg,
      basePath: `/p/${customer.token}`,
      currentPage: "zones-new",
    });
  }
});

// ── Update Zone (form POST) ──────────────────────────────────────────────

router.post("/:token/zones/:id/update", async (req: Request, res: Response) => {
  try {
    const customer = req.customer!;
    const b = req.body;

    // Ownership check
    const check = await query(
      "SELECT 1 FROM zone_configs WHERE id = $1 AND account_id = $2",
      [req.params.id, customer.account_id]
    );
    if (check.rows.length === 0) {
      res.status(404).send("Not found");
      return;
    }

    const prayers = collectPrayers(b);
    if (!prayers) {
      const existing = await query("SELECT * FROM zone_configs WHERE id = $1", [
        req.params.id,
      ]);
      res.render("portal/zone-form", {
        zone: existing.rows[0] ?? null,
        customer,
        methods: CALCULATION_METHODS,
        error: "Select at least one prayer.",
        basePath: `/p/${customer.token}`,
        currentPage: "zones-new",
      });
      return;
    }

    const durations = collectDurations(b);
    const result = await query(
      `UPDATE zone_configs SET
        city = $1, country = $2, timezone = $3, method = $4, asr_school = $5,
        prayers = $6, pause_offset_minutes = $7, pause_durations = $8,
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
        JSON.stringify(durations),
        b.mode || "year-round",
        b.enabled !== "false",
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      res.status(404).send("Not found");
      return;
    }

    await refreshZone(result.rows[0].id);
    res.redirect(`/p/${customer.token}`);
  } catch (err) {
    const customer = req.customer!;
    const msg = err instanceof Error ? err.message : String(err);
    const existing = await query("SELECT * FROM zone_configs WHERE id = $1 AND account_id = $2", [
      req.params.id, customer.account_id,
    ]);
    res.render("portal/zone-form", {
      zone: existing.rows[0] ?? null,
      customer,
      methods: CALCULATION_METHODS,
      error: msg,
      basePath: `/p/${customer.token}`,
      currentPage: "zones-new",
    });
  }
});

// ── Activity Log ─────────────────────────────────────────────────────────

router.get("/:token/log", async (req: Request, res: Response) => {
  try {
    const customer = req.customer!;
    const result = await query(
      `SELECT al.*, zc.zone_name, zc.account_name
       FROM action_log al
       JOIN zone_configs zc ON zc.id = al.zone_config_id
       WHERE zc.account_id = $1
       ORDER BY al.created_at DESC
       LIMIT 100`,
      [customer.account_id]
    );
    res.render("portal/log", {
      logs: result.rows,
      customer,
      basePath: `/p/${customer.token}`,
      currentPage: "log",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Error: ${msg}`);
  }
});

export default router;
