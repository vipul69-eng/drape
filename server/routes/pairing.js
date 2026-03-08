/**
 * routes/pairing.js — Device pairing endpoints
 *
 * POST /api/pair/generate  — Generate a 6-char pairing token
 * POST /api/pair/consume   — Consume a token to link devices
 */

const { Router } = require("express");
const { query } = require("../db");

const router = Router();

const PAIR_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

function generateToken() {
  let token = "";
  const arr = new Uint8Array(6);
  // Use Math.random as fallback (crypto.getRandomValues not in Node < 19)
  for (let i = 0; i < 6; i++) {
    token += PAIR_CHARS[Math.floor(Math.random() * PAIR_CHARS.length)];
  }
  return token;
}

// ── POST /api/pair/generate ──
router.post("/generate", async (req, res) => {
  try {
    // Revoke any existing active tokens for this device
    await query(
      `DELETE FROM pairing_tokens
       WHERE device_id = $1 AND consumed = FALSE`,
      [req.deviceId]
    );

    const ttl = parseInt(process.env.PAIR_TOKEN_TTL, 10) || 300;
    const token = generateToken();
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    await query(
      `INSERT INTO pairing_tokens (token, device_id, expires_at)
       VALUES ($1, $2, $3)`,
      [token, req.deviceId, expiresAt]
    );

    res.json({ token, expiresAt });
  } catch (err) {
    console.error("[pair:generate]", err.message);
    res.status(500).json({ error: "Failed to generate pairing code" });
  }
});

// ── POST /api/pair/consume ──
router.post("/consume", async (req, res) => {
  const { token } = req.body;

  if (!token || typeof token !== "string" || token.trim().length < 6) {
    return res.status(400).json({ error: "Invalid pairing code" });
  }

  const cleanToken = token.toUpperCase().trim().slice(0, 6);

  try {
    // Find valid, unconsumed, non-expired token
    const rows = await query(
      `SELECT device_id FROM pairing_tokens
       WHERE token = $1 AND consumed = FALSE AND expires_at > NOW()`,
      [cleanToken]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Invalid or expired pairing code" });
    }

    const originalDeviceId = rows[0].device_id;

    // Prevent self-pairing
    if (originalDeviceId === req.deviceId) {
      return res.status(400).json({ error: "Cannot pair a device with itself" });
    }

    // Link this device to the original device's data
    await query(
      `UPDATE devices SET linked_device_id = $1 WHERE device_id = $2`,
      [originalDeviceId, req.deviceId]
    );

    // Mark token consumed
    await query(
      `UPDATE pairing_tokens SET consumed = TRUE WHERE token = $1`,
      [cleanToken]
    );

    res.json({
      ok: true,
      linkedTo: originalDeviceId,
      message: "Device linked successfully. You now share the same wardrobe and profile.",
    });
  } catch (err) {
    console.error("[pair:consume]", err.message);
    res.status(500).json({ error: "Pairing failed" });
  }
});

module.exports = router;
