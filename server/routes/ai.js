/**
 * routes/ai.js — AI proxy endpoints
 *
 * POST /api/ai/chat      — Text chat proxy to Groq
 * POST /api/ai/analyze    — Vision analysis for clothing item photos
 * POST /api/ai/body       — Vision analysis for body/profile photos
 *
 * All Groq API keys stay server-side. Client never sees them.
 */

const { Router } = require("express");

const router = Router();

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";
const GROQ_VISION_MODEL = "llama-3.2-90b-vision-preview";

// ── Helpers ──

function groqAvailable() {
  return !!process.env.GROQ_API_KEY;
}

async function callGroq(model, messages, maxTokens = 900, temperature = 0.6) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || `Groq returned ${res.status}`;
    console.error(`[ai] Groq error (${model}):`, msg);
    throw new Error(msg);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

function validateMessages(messages) {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return "Messages array is required";
  }
  for (const msg of messages) {
    if (!msg.role || !msg.content) return "Each message must have role and content";
    if (!["system", "user", "assistant"].includes(msg.role)) return "Invalid message role";
    if (typeof msg.content === "string" && msg.content.length > 12_000) {
      return "Message content too long (max 12,000 chars)";
    }
  }
  return null;
}

function validateImagePayload(body) {
  const { imageDataUrl } = body || {};
  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    return { error: "imageDataUrl is required (base64 data URL)" };
  }
  if (!imageDataUrl.startsWith("data:image/")) {
    return { error: "imageDataUrl must be a valid data:image/* URL" };
  }
  if (imageDataUrl.length > 2_800_000) {
    return { error: "Image too large. Compress below 2MB before uploading." };
  }
  return null;
}

function tryParseJSON(raw) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return { parsed: JSON.parse(cleaned) };
  } catch {
    return { raw: cleaned };
  }
}

// ══════════ POST /api/ai/chat ══════════
router.post("/chat", async (req, res) => {
  if (!groqAvailable()) {
    return res.json({
      reply:
        "AI features are not configured yet. Your profile and wardrobe are saved — once the Groq API key is added, I'll give you personalised outfit advice every day. 🌿",
    });
  }

  const { messages } = req.body;
  const err = validateMessages(messages);
  if (err) return res.status(400).json({ error: err });

  try {
    const trimmed = messages.slice(-16);
    const reply = await callGroq(GROQ_CHAT_MODEL, trimmed, 900, 0.72);
    res.json({ reply: reply || "I couldn't generate a response." });
  } catch (e) {
    res.status(502).json({ error: e.message || "AI service unavailable" });
  }
});

// ══════════ POST /api/ai/analyze ══════════
// Analyze a clothing item photo → structured JSON
router.post("/analyze", async (req, res) => {
  if (!groqAvailable()) {
    return res.json({ detected: null, message: "AI not configured" });
  }

  const validErr = validateImagePayload(req.body);
  if (validErr) return res.status(400).json(validErr);

  try {
    const messages = [
      {
        role: "system",
        content:
          'You are a clothing recognition AI. Analyse the clothing item in the image. Respond with ONLY valid JSON, no markdown fences, no explanation:\n{"name":"<descriptive name>","category":"Topwear|Bottomwear|Shoes|Outerwear|Accessories","color":"<primary color>","occasion":"Casual|Smart Casual|Formal|Sportswear|Party","season":"All Season|Summer|Winter|Monsoon|Spring"}',
      },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: req.body.imageDataUrl } },
          { type: "text", text: "Identify this clothing item. Return JSON only." },
        ],
      },
    ];

    const raw = await callGroq(GROQ_VISION_MODEL, messages, 200);
    const result = tryParseJSON(raw);

    if (result.parsed) {
      res.json({ detected: result.parsed });
    } else {
      console.warn("[ai:analyze] Non-JSON response:", result.raw?.slice(0, 120));
      res.json({ detected: null, raw: result.raw });
    }
  } catch (e) {
    res.status(502).json({ error: e.message || "Vision analysis failed" });
  }
});

// ══════════ POST /api/ai/body ══════════
// Analyze a body/profile photo → build, skin tone, fit recs
router.post("/body", async (req, res) => {
  if (!groqAvailable()) {
    return res.json({ analysis: null, message: "AI not configured" });
  }

  const validErr = validateImagePayload(req.body);
  if (validErr) return res.status(400).json(validErr);

  try {
    const messages = [
      {
        role: "system",
        content:
          'You are a fashion AI that analyses body photos for styling recommendations. Respond with ONLY valid JSON, no markdown:\n{"build":"Lean / Slim|Athletic|Average|Broad / Stocky|Curvy / Plus","height_approx":"<estimate>","skin_tone":"Fair|Light|Wheatish|Olive|Brown|Dark","body_shape":"<brief description>","fit_recommendation":"<1-2 sentence styling tip>"}',
      },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: req.body.imageDataUrl } },
          {
            type: "text",
            text: "Analyse this person's body type for fashion recommendations. Return JSON only.",
          },
        ],
      },
    ];

    const raw = await callGroq(GROQ_VISION_MODEL, messages, 250);
    const result = tryParseJSON(raw);

    if (result.parsed) {
      res.json({ analysis: result.parsed });
    } else {
      console.warn("[ai:body] Non-JSON response:", result.raw?.slice(0, 120));
      res.json({ analysis: null, raw: result.raw });
    }
  } catch (e) {
    res.status(502).json({ error: e.message || "Body analysis failed" });
  }
});

module.exports = router;
