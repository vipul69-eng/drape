/**
 * auth.js — Device-based authentication middleware
 *
 * Every API request must include an X-Device-ID header.
 * The middleware:
 *  1. Validates the device ID format (UUID v4)
 *  2. Upserts the device into the devices table
 *  3. Resolves the "data owner" (follows linked_device_id if paired)
 *  4. Attaches deviceId + ownerId to req for downstream handlers
 */

const { query } = require("./db");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function deviceAuth(req, res, next) {
  const deviceId = req.headers["x-device-id"];

  if (!deviceId || !UUID_RE.test(deviceId)) {
    return res.status(401).json({
      error: "Missing or invalid X-Device-ID header. Must be a valid UUID v4.",
    });
  }

  try {
    // Upsert device — registers new devices automatically
    await query(
      `INSERT INTO devices (device_id, last_seen)
       VALUES ($1, NOW())
       ON CONFLICT (device_id)
       DO UPDATE SET last_seen = NOW()`,
      [deviceId],
    );

    // Resolve data owner (follow linked_device_id for paired devices)
    const rows = await query(
      `SELECT device_id, linked_device_id FROM devices WHERE device_id = $1`,
      [deviceId],
    );

    const ownerId =
      rows.length > 0 && rows[0].linked_device_id
        ? rows[0].linked_device_id
        : deviceId;

    // Attach to request
    req.deviceId = deviceId;
    req.ownerId = ownerId;

    next();
  } catch (err) {
    console.error("[auth] Device registration failed:", err.message);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

module.exports = { deviceAuth };
