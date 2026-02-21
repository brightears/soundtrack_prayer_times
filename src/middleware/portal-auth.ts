import { type Request, type Response, type NextFunction } from "express";
import { query } from "../db.js";

export interface CustomerRecord {
  id: string;
  token: string;
  name: string;
  account_id: string;
  account_name: string;
  enabled: boolean;
}

declare global {
  namespace Express {
    interface Request {
      customer?: CustomerRecord;
    }
  }
}

export async function portalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.params.token;
  if (!token) {
    res.status(404).send("Not found");
    return;
  }

  try {
    const result = await query(
      "SELECT * FROM customers WHERE token = $1 AND enabled = true",
      [token]
    );

    if (result.rows.length === 0) {
      res.status(404).send("Not found");
      return;
    }

    req.customer = result.rows[0] as CustomerRecord;
    next();
  } catch (err) {
    console.error("Portal auth error:", err);
    res.status(500).send("Internal error");
  }
}
