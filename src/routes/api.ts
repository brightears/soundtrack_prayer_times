import { Router, type Request, type Response } from "express";
import { query } from "../db.js";
import { graphql, extractNodes } from "../soundtrack.js";
import {
  ME_ACCOUNTS_PAGE,
  ACCOUNT_LOCATIONS,
  LOCATION_SOUND_ZONES,
} from "../queries.js";
import { refreshZone, refreshAllSchedules } from "../scheduler.js";

const router = Router();

function wrap(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((err: Error) => {
      console.error("API error:", err.message);
      res.status(500).json({ error: err.message });
    });
  };
}

// ── Zone Configs CRUD ─────────────────────────────────────────────────────

router.get(
  "/zones",
  wrap(async (_req, res) => {
    const result = await query(
      "SELECT * FROM zone_configs ORDER BY created_at DESC"
    );
    res.json(result.rows);
  })
);

router.get(
  "/zones/:id",
  wrap(async (req, res) => {
    const result = await query("SELECT * FROM zone_configs WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Zone config not found" });
      return;
    }
    res.json(result.rows[0]);
  })
);

router.post(
  "/zones",
  wrap(async (req, res) => {
    const {
      account_id,
      account_name,
      location_id,
      location_name,
      zone_id,
      zone_name,
      city,
      country,
      latitude,
      longitude,
      timezone,
      method,
      asr_school,
      prayers,
      pause_offset_minutes,
      pause_duration_minutes,
      mode,
      enabled,
    } = req.body;

    const result = await query(
      `INSERT INTO zone_configs
       (account_id, account_name, location_id, location_name, zone_id, zone_name,
        city, country, latitude, longitude, timezone, method, asr_school,
        prayers, pause_offset_minutes, pause_duration_minutes, mode, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        account_id,
        account_name,
        location_id,
        location_name,
        zone_id,
        zone_name,
        city,
        country,
        latitude || null,
        longitude || null,
        timezone,
        method ?? 4,
        asr_school ?? 0,
        prayers ?? "Fajr,Dhuhr,Asr,Maghrib,Isha",
        pause_offset_minutes ?? 0,
        pause_duration_minutes ?? 20,
        mode ?? "year-round",
        enabled ?? true,
      ]
    );

    const config = result.rows[0];

    // Schedule immediately
    if (config.enabled) {
      await refreshZone(config.id);
    }

    res.status(201).json(config);
  })
);

router.put(
  "/zones/:id",
  wrap(async (req, res) => {
    const {
      city,
      country,
      latitude,
      longitude,
      timezone,
      method,
      asr_school,
      prayers,
      pause_offset_minutes,
      pause_duration_minutes,
      mode,
      enabled,
    } = req.body;

    const result = await query(
      `UPDATE zone_configs SET
        city = $1, country = $2, latitude = $3, longitude = $4,
        timezone = $5, method = $6, asr_school = $7, prayers = $8,
        pause_offset_minutes = $9, pause_duration_minutes = $10,
        mode = $11, enabled = $12, updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [
        city,
        country,
        latitude || null,
        longitude || null,
        timezone,
        method,
        asr_school,
        prayers,
        pause_offset_minutes,
        pause_duration_minutes,
        mode,
        enabled,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Zone config not found" });
      return;
    }

    // Reschedule
    await refreshZone(result.rows[0].id);

    res.json(result.rows[0]);
  })
);

router.delete(
  "/zones/:id",
  wrap(async (req, res) => {
    const result = await query(
      "DELETE FROM zone_configs WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Zone config not found" });
      return;
    }
    res.json({ deleted: true });
  })
);

// ── Action Log ────────────────────────────────────────────────────────────

router.get(
  "/log",
  wrap(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const result = await query(
      `SELECT al.*, zc.zone_name, zc.account_name
       FROM action_log al
       JOIN zone_configs zc ON zc.id = al.zone_config_id
       ORDER BY al.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  })
);

// ── Scheduler Control ─────────────────────────────────────────────────────

router.post(
  "/refresh",
  wrap(async (_req, res) => {
    await refreshAllSchedules();
    res.json({ refreshed: true });
  })
);

// ── Soundtrack Proxy (for frontend dropdowns) ─────────────────────────────

interface AccountNode {
  id: string;
  businessName: string;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

router.get(
  "/soundtrack/accounts",
  wrap(async (req, res) => {
    const searchName = (req.query.search as string)?.toLowerCase();
    const accounts: AccountNode[] = [];
    let after: string | null = null;
    let hasNextPage = true;

    interface MeAccountsData {
      me: {
        accounts: {
          edges: Array<{ node: AccountNode }>;
          pageInfo: PageInfo;
        };
      };
    }

    while (hasNextPage) {
      const result: { data?: MeAccountsData } = await graphql<MeAccountsData>(
        ME_ACCOUNTS_PAGE,
        { first: 100, after }
      );

      const connection = result.data!.me.accounts;
      const nodes: AccountNode[] = extractNodes(connection);
      accounts.push(...nodes);
      hasNextPage = connection.pageInfo.hasNextPage;
      after = connection.pageInfo.endCursor;
    }

    const filtered = searchName
      ? accounts.filter((a) =>
          a.businessName.toLowerCase().includes(searchName)
        )
      : accounts;

    res.json(
      filtered.map((a) => ({ id: a.id, name: a.businessName.trim() }))
    );
  })
);

router.get(
  "/soundtrack/accounts/:accountId/locations",
  wrap(async (req, res) => {
    const result = await graphql<{
      account: {
        locations: {
          edges: Array<{ node: { id: string; name: string } }>;
        };
      };
    }>(ACCOUNT_LOCATIONS, { accountId: req.params.accountId as string });

    const locations = extractNodes(result.data!.account.locations);
    res.json(locations);
  })
);

router.get(
  "/soundtrack/accounts/:accountId/zones",
  wrap(async (req, res) => {
    const result = await graphql<{
      account: {
        locations: {
          edges: Array<{
            node: {
              id: string;
              name: string;
              soundZones: {
                edges: Array<{
                  node: { id: string; name: string; isPaired: boolean };
                }>;
              };
            };
          }>;
        };
      };
    }>(LOCATION_SOUND_ZONES, { accountId: req.params.accountId as string });

    const locations = extractNodes(result.data!.account.locations);
    const zones = locations.flatMap((loc) => {
      const zoneNodes = extractNodes(loc.soundZones);
      return zoneNodes.map((z) => ({
        ...z,
        locationId: loc.id,
        locationName: loc.name,
      }));
    });
    res.json(zones);
  })
);

export default router;
