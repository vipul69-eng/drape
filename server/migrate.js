/**
 * migrate.js — Idempotent schema setup for DRAPE
 *
 * Run: npm run db:migrate
 *
 * Safe to run multiple times — uses IF NOT EXISTS everywhere.
 * Creates tables: devices, profiles, wardrobe_items, pairing_tokens
 */

require("dotenv").config();
const { query } = require("./db");

const MIGRATIONS = [
  // ── Devices: primary identity table ──
  `CREATE TABLE IF NOT EXISTS devices (
    device_id     TEXT PRIMARY KEY,
    linked_device_id TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── Profiles: one per data-owner device ──
  `CREATE TABLE IF NOT EXISTS profiles (
    device_id     TEXT PRIMARY KEY REFERENCES devices(device_id) ON DELETE CASCADE,
    name          TEXT NOT NULL DEFAULT '',
    age           INTEGER,
    gender        TEXT DEFAULT '',
    height        TEXT DEFAULT '',
    build         TEXT DEFAULT '',
    skin_tone     TEXT DEFAULT '',
    style_vibe    TEXT DEFAULT '',
    lifestyle     TEXT DEFAULT '',
    location      TEXT DEFAULT '',
    photo_data    TEXT,
    photo_analysis JSONB,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── Wardrobe items ──
  `CREATE TABLE IF NOT EXISTS wardrobe_items (
    id            SERIAL PRIMARY KEY,
    device_id     TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL DEFAULT 'Topwear',
    color         TEXT DEFAULT '',
    occasion      TEXT DEFAULT 'Casual',
    season        TEXT DEFAULT 'All Season',
    brand         TEXT DEFAULT '',
    photo_data    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── Pairing tokens for multi-device sync ──
  `CREATE TABLE IF NOT EXISTS pairing_tokens (
    token         TEXT PRIMARY KEY,
    device_id     TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    expires_at    TIMESTAMPTZ NOT NULL,
    consumed      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // ── Indexes ──
  `CREATE INDEX IF NOT EXISTS idx_wardrobe_device
   ON wardrobe_items(device_id)`,

  `CREATE INDEX IF NOT EXISTS idx_wardrobe_category
   ON wardrobe_items(device_id, category)`,

  `CREATE INDEX IF NOT EXISTS idx_pairing_expires
   ON pairing_tokens(expires_at)
   WHERE consumed = FALSE`,
];

async function migrate() {
  console.log("🔄 Running DRAPE database migrations…\n");

  for (let i = 0; i < MIGRATIONS.length; i++) {
    const label = MIGRATIONS[i].trim().slice(0, 60).replace(/\s+/g, " ");
    try {
      await query(MIGRATIONS[i]);
      console.log(`  ✓ [${i + 1}/${MIGRATIONS.length}] ${label}…`);
    } catch (err) {
      console.error(`  ✗ [${i + 1}/${MIGRATIONS.length}] ${label}…`);
      console.error(`    Error: ${err.message}`);
      process.exit(1);
    }
  }

  // Cleanup expired tokens
  try {
    const deleted = await query(
      `DELETE FROM pairing_tokens WHERE expires_at < NOW() RETURNING token`,
    );
    if (deleted.length > 0) {
      console.log(`\n  🧹 Cleaned ${deleted.length} expired pairing token(s)`);
    }
  } catch (_) {}

  console.log("\n✅ All migrations complete.\n");
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
