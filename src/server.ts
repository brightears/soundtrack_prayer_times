import "dotenv/config";
import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "./db.js";
import { startScheduler, stopScheduler, getSchedulerStatus } from "./scheduler.js";
import apiRouter from "./routes/api.js";
import pageRouter from "./routes/pages.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files and views are in src/ (not compiled to dist/)
const srcDir = join(__dirname, "..", "src");
app.use("/public", express.static(join(srcDir, "public")));

// EJS views
app.set("view engine", "ejs");
app.set("views", join(srcDir, "views"));

// Admin auth middleware (HTTP Basic Auth)
if (ADMIN_PASSWORD) {
  app.use((req, res, next) => {
    // Skip auth for health endpoint
    if (req.path === "/health") return next();

    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Basic ")) {
      res.set("WWW-Authenticate", 'Basic realm="Prayer Times Admin"');
      res.status(401).send("Authentication required");
      return;
    }

    const decoded = Buffer.from(auth.slice(6), "base64").toString();
    const [, password] = decoded.split(":");

    if (password !== ADMIN_PASSWORD) {
      res.set("WWW-Authenticate", 'Basic realm="Prayer Times Admin"');
      res.status(401).send("Invalid credentials");
      return;
    }

    next();
  });
}

// Health endpoint
app.get("/health", (_req, res) => {
  const status = getSchedulerStatus();
  res.json({
    status: "ok",
    server: "soundtrack-prayertimes",
    version: "1.0.0",
    scheduler: status,
  });
});

// Routes
app.use("/api", apiRouter);
app.use("/", pageRouter);

// Start server
async function main(): Promise<void> {
  // Run database migrations
  await runMigrations();
  console.log("Database migrations complete.");

  // Start scheduler
  startScheduler();

  // Start HTTP server
  app.listen(PORT, () => {
    console.log(`Prayer Times server running on port ${PORT}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM received. Shutting down...");
    stopScheduler();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("SIGINT received. Shutting down...");
    stopScheduler();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
