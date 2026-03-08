/**
 * routes/profile.js — Profile CRUD endpoints
 *
 * GET  /api/profile     — Load profile for current data owner
 * PUT  /api/profile     — Create or update profile
 */

const { Router } = require("express");
const { query } = require("../db");

const router = Router();

// ── GET /api/profile ──
router.get("/", async (req, res) => {
  try {
    const rows = await query(
      `SELECT name, age, gender, height, build, skin_tone, style_vibe,
              lifestyle, location, photo_data, photo_analysis
       FROM profiles WHERE device_id = $1`,
      [req.ownerId]
    );

    if (rows.length === 0) {
      return res.json({ profile: null });
    }

    const r = rows[0];
    res.json({
      profile: {
        name: r.name,
        age: r.age,
        gender: r.gender,
        height: r.height,
        build: r.build,
        skin: r.skin_tone,
        style: r.style_vibe,
        lifestyle: r.lifestyle,
        location: r.location,
        photo: r.photo_data || null,
        photoAnalysis: r.photo_analysis || null,
      },
    });
  } catch (err) {
    console.error("[profile:get]", err.message);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// ── PUT /api/profile ──
router.put("/", async (req, res) => {
  const p = req.body;

  if (!p || !p.name || typeof p.name !== "string" || !p.name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  // Sanitize photo_data size (limit ~2MB base64)
  if (p.photo && typeof p.photo === "string" && p.photo.length > 2_500_000) {
    return res.status(400).json({ error: "Photo too large. Compress below 2MB." });
  }

  try {
    await query(
      `INSERT INTO profiles
         (device_id, name, age, gender, height, build, skin_tone,
          style_vibe, lifestyle, location, photo_data, photo_analysis, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (device_id)
       DO UPDATE SET
         name=EXCLUDED.name, age=EXCLUDED.age, gender=EXCLUDED.gender,
         height=EXCLUDED.height, build=EXCLUDED.build, skin_tone=EXCLUDED.skin_tone,
         style_vibe=EXCLUDED.style_vibe, lifestyle=EXCLUDED.lifestyle,
         location=EXCLUDED.location, photo_data=EXCLUDED.photo_data,
         photo_analysis=EXCLUDED.photo_analysis, updated_at=NOW()`,
      [
        req.ownerId,
        p.name.trim(),
        p.age ? parseInt(p.age, 10) || null : null,
        p.gender || "",
        p.height || "",
        p.build || "",
        p.skin || "",
        p.style || "",
        p.lifestyle || "",
        p.location || "",
        p.photo || null,
        p.photoAnalysis ? JSON.stringify(p.photoAnalysis) : null,
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("[profile:put]", err.message);
    res.status(500).json({ error: "Failed to save profile" });
  }
});

module.exports = router;
