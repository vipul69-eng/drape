/**
 * DRAPE — Production Server
 *
 * Express server with:
 *  - Neon Postgres persistence
 *  - Device-based authentication (UUID in X-Device-ID header)
 *  - Groq AI proxy (key stays server-side)
 *  - Security headers (helmet), compression, rate limiting
 *  - Auto-migration on startup
 */

require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const path = require("path");

const { query } = require("./db");
const { deviceAuth } = require("./auth");

// Route modules
const profileRoutes = require("./routes/profile");
const wardrobeRoutes = require("./routes/wardrobe");
const pairingRoutes = require("./routes/pairing");
const aiRoutes = require("./routes/ai");

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ══════════ MIDDLEWARE ══════════

// Request logger (dev only)
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    const device = (req.headers["x-device-id"] || "none").slice(0, 8);
    console.log(`  → ${req.method} ${req.path} [${device}…]`);
    next();
  });
}

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
      },
    },
  }),
);

// CORS — restrict in production
app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? false : "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "X-Device-ID"],
  }),
);

// Compression
app.use(compression());

// Body parsing — 5MB limit for photo uploads
app.use(express.json({ limit: "5mb" }));

// Rate limiting per device
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  keyGenerator: (req) => req.headers["x-device-id"] || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
app.use("/api/", limiter);

// ══════════ STATIC FILES ══════════
app.use(express.static(path.join(__dirname, "..", "public")));

// ══════════ HEALTH CHECK ══════════
app.get("/api/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({
      status: "ok",
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res
      .status(503)
      .json({ status: "error", db: "disconnected", error: err.message });
  }
});

// ══════════ API ROUTES (all require device auth) ══════════
app.use("/api/profile", deviceAuth, profileRoutes);
app.use("/api/wardrobe", deviceAuth, wardrobeRoutes);
app.use("/api/pair", deviceAuth, pairingRoutes);
app.use("/api/ai", deviceAuth, aiRoutes);

// ══════════ SPA FALLBACK ══════════
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// ══════════ ERROR HANDLER ══════════
app.use((err, _req, res, _next) => {
  console.error("[server] Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// ══════════ STARTUP ══════════
async function start() {
  console.log("\n  ╔═══════════════════════════════╗");
  console.log("  ║      DRAPE — AI Stylist        ║");
  console.log("  ╚═══════════════════════════════╝\n");

  // Validate required env
  if (!process.env.DATABASE_URL) {
    console.error("  ✗ DATABASE_URL is not set. Check your .env file.\n");
    process.exit(1);
  }

  // Auto-migrate on startup
  console.log("  📦 Running database migrations…");
  try {
    const { query: q } = require("./db.js");

    const migrations = [
      `CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        linked_device_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS profiles (
        device_id TEXT PRIMARY KEY REFERENCES devices(device_id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT '', age INTEGER, gender TEXT DEFAULT '',
        height TEXT DEFAULT '', build TEXT DEFAULT '', skin_tone TEXT DEFAULT '',
        style_vibe TEXT DEFAULT '', lifestyle TEXT DEFAULT '', location TEXT DEFAULT '',
        photo_data TEXT, photo_analysis JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS wardrobe_items (
        id SERIAL PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
        name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Topwear',
        color TEXT DEFAULT '', occasion TEXT DEFAULT 'Casual',
        season TEXT DEFAULT 'All Season', brand TEXT DEFAULT '',
        photo_data TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS pairing_tokens (
        token TEXT PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL, consumed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_wardrobe_device ON wardrobe_items(device_id)`,
      `CREATE INDEX IF NOT EXISTS idx_wardrobe_category ON wardrobe_items(device_id, category)`,
      `CREATE INDEX IF NOT EXISTS idx_pairing_expires ON pairing_tokens(expires_at) WHERE consumed = FALSE`,
    ];

    for (const sql of migrations) await q(sql);
    console.log("  ✓ Database ready\n");
  } catch (err) {
    console.error("  ✗ Migration failed:", err);
    process.exit(1);
  }

  // Status
  console.log(
    `  🔑 Groq AI: ${process.env.GROQ_API_KEY ? "configured" : "not set (AI features disabled)"}`,
  );
  console.log(
    `  🛡  Rate limit: ${process.env.RATE_LIMIT_MAX || 100} req/15min per device`,
  );
  console.log(`  🔗 Pair TTL: ${process.env.PAIR_TOKEN_TTL || 300}s\n`);

  app.listen(PORT, () => {
    console.log(`  🚀 DRAPE running at http://localhost:${PORT}\n`);
  });

  // Periodic cleanup of expired pairing tokens (every 30 min)
  setInterval(
    async () => {
      try {
        await query(`DELETE FROM pairing_tokens WHERE expires_at < NOW()`);
      } catch (_) {}
    },
    30 * 60 * 1000,
  );

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n  ⏹  ${signal} received. Shutting down…`);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start();
