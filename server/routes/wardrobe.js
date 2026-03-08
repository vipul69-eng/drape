/**
 * routes/wardrobe.js — Wardrobe CRUD endpoints
 *
 * GET    /api/wardrobe          — List all items for data owner
 * POST   /api/wardrobe          — Add a new item
 * DELETE /api/wardrobe/:id       — Remove an item
 */

const { Router } = require("express");
const { query } = require("../db");

const router = Router();

const VALID_CATEGORIES = ["Topwear", "Bottomwear", "Shoes", "Outerwear", "Accessories"];
const VALID_OCCASIONS = ["Casual", "Smart Casual", "Formal", "Sportswear", "Party"];
const VALID_SEASONS = ["All Season", "Summer", "Winter", "Monsoon", "Spring"];

// ── GET /api/wardrobe ──
router.get("/", async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, name, category, color, occasion, season, brand, photo_data, created_at
       FROM wardrobe_items
       WHERE device_id = $1
       ORDER BY created_at DESC`,
      [req.ownerId]
    );

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        color: r.color,
        occasion: r.occasion,
        season: r.season,
        brand: r.brand,
        photo: r.photo_data || null,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error("[wardrobe:get]", err.message);
    res.status(500).json({ error: "Failed to load wardrobe" });
  }
});

// ── POST /api/wardrobe ──
router.post("/", async (req, res) => {
  const item = req.body;

  if (!item || !item.name || typeof item.name !== "string" || !item.name.trim()) {
    return res.status(400).json({ error: "Item name is required" });
  }

  if (item.name.trim().length > 200) {
    return res.status(400).json({ error: "Item name too long (max 200 chars)" });
  }

  // Validate category
  const category = VALID_CATEGORIES.includes(item.category) ? item.category : "Topwear";
  const occasion = VALID_OCCASIONS.includes(item.occasion) ? item.occasion : "Casual";
  const season = VALID_SEASONS.includes(item.season) ? item.season : "All Season";

  // Photo size check (~1.5MB base64)
  if (item.photo && typeof item.photo === "string" && item.photo.length > 1_800_000) {
    return res.status(400).json({ error: "Item photo too large. Compress below 1.5MB." });
  }

  try {
    const rows = await query(
      `INSERT INTO wardrobe_items
         (device_id, name, category, color, occasion, season, brand, photo_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, created_at`,
      [
        req.ownerId,
        item.name.trim(),
        category,
        (item.color || "Not specified").slice(0, 50),
        occasion,
        season,
        (item.brand || "").slice(0, 100),
        item.photo || null,
      ]
    );

    res.status(201).json({
      id: rows[0].id,
      createdAt: rows[0].created_at,
    });
  } catch (err) {
    console.error("[wardrobe:post]", err.message);
    res.status(500).json({ error: "Failed to add item" });
  }
});

// ── DELETE /api/wardrobe/:id ──
router.delete("/:id", async (req, res) => {
  const itemId = parseInt(req.params.id, 10);
  if (isNaN(itemId)) {
    return res.status(400).json({ error: "Invalid item ID" });
  }

  try {
    const rows = await query(
      `DELETE FROM wardrobe_items
       WHERE id = $1 AND device_id = $2
       RETURNING id`,
      [itemId, req.ownerId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[wardrobe:delete]", err.message);
    res.status(500).json({ error: "Failed to delete item" });
  }
});

module.exports = router;
