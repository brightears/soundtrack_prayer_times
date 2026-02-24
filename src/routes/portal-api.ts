import { Router, type Request, type Response } from "express";
import { query } from "../db.js";
import { graphql, extractNodes } from "../soundtrack.js";
import { LOCATION_SOUND_ZONES, ACCOUNT_LIBRARY } from "../queries.js";
import { testZone, refreshZone } from "../scheduler.js";
import { portalAuth } from "../middleware/portal-auth.js";

const router = Router();

function wrap(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((err: Error) => {
      console.error("Portal API error:", err.message);
      res.status(500).json({ error: err.message });
    });
  };
}

// All routes require valid portal token
router.use("/:token/api", portalAuth);

// Ownership check helper
async function verifyOwnership(zoneConfigId: string, accountId: string): Promise<boolean> {
  const result = await query(
    "SELECT 1 FROM zone_configs WHERE id = $1 AND account_id = $2",
    [zoneConfigId, accountId]
  );
  return result.rows.length > 0;
}

// ── Zone Test ────────────────────────────────────────────────────────────

router.post(
  "/:token/api/zones/:id/test",
  wrap(async (req, res) => {
    const customer = req.customer!;
    const zoneId = req.params.id as string;
    if (!(await verifyOwnership(zoneId, customer.account_id))) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const pauseSeconds = Math.min(Number(req.query.duration) || 10, 60);
    const result = await query("SELECT * FROM zone_configs WHERE id = $1", [
      zoneId,
    ]);
    const config = result.rows[0];
    const testResult = await testZone(config.id, config.zone_id, pauseSeconds);
    res.json(testResult);
  })
);

// ── Delete Zone ──────────────────────────────────────────────────────────

router.delete(
  "/:token/api/zones/:id",
  wrap(async (req, res) => {
    const customer = req.customer!;
    const zoneId = req.params.id as string;
    if (!(await verifyOwnership(zoneId, customer.account_id))) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await query("DELETE FROM zone_configs WHERE id = $1", [zoneId]);
    res.json({ deleted: true });
  })
);

// ── Refresh Schedules (scoped) ───────────────────────────────────────────

router.post(
  "/:token/api/refresh",
  wrap(async (req, res) => {
    const customer = req.customer!;
    const zones = await query(
      "SELECT id FROM zone_configs WHERE account_id = $1 AND enabled = true",
      [customer.account_id]
    );
    for (const zone of zones.rows) {
      await refreshZone(zone.id);
    }
    res.json({ refreshed: true, count: zones.rows.length });
  })
);

// ── Soundtrack Zones (scoped to customer's account) ──────────────────────

router.get(
  "/:token/api/soundtrack/zones",
  wrap(async (req, res) => {
    const customer = req.customer!;
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
    }>(LOCATION_SOUND_ZONES, { accountId: customer.account_id });

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

// ── Soundtrack Library (scoped to customer's account) ────────────────────

router.get(
  "/:token/api/soundtrack/library",
  wrap(async (req, res) => {
    const customer = req.customer!;
    const result = await graphql<{
      account: {
        musicLibrary: {
          playlists: {
            edges: Array<{ node: { id: string; name: string } }>;
          };
          schedules: {
            edges: Array<{ node: { id: string; name: string } }>;
          };
        };
      };
    }>(ACCOUNT_LIBRARY, { accountId: customer.account_id });

    const library = result.data!.account.musicLibrary;
    res.json({
      playlists: extractNodes(library.playlists),
      schedules: extractNodes(library.schedules),
    });
  })
);

export default router;
