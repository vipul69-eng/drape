/**
 * api.js — HTTP client for DRAPE backend
 *
 * Every request includes X-Device-ID header for device auth.
 * All methods return parsed JSON or throw descriptive errors.
 */

const API = (() => {
  const DEVICE_ID_KEY = "drape_device_id";

  /** Generate UUID v4 */
  function generateUUID() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /** Get or create persistent device ID */
  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = generateUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  /**
   * Base URL — auto-detects server.
   * When served by Express: "" (same origin, relative paths work)
   * When opened as file:// : requests will fail gracefully
   */
  const BASE = "";

  /** Core fetch wrapper with device auth */
  async function request(path, options = {}) {
    const deviceId = getDeviceId();

    const res = await fetch(BASE + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Device-ID": deviceId,
        ...(options.headers || {}),
      },
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }

    return data;
  }

  return {
    getDeviceId,

    /** Health check — no auth needed */
    async health() {
      const res = await fetch(BASE + "/api/health");
      return res.json();
    },

    // ── Profile ──
    async getProfile() {
      return request("/api/profile");
    },

    async saveProfile(profile) {
      return request("/api/profile", {
        method: "PUT",
        body: JSON.stringify(profile),
      });
    },

    // ── Wardrobe ──
    async getWardrobe() {
      return request("/api/wardrobe");
    },

    async addItem(item) {
      return request("/api/wardrobe", {
        method: "POST",
        body: JSON.stringify(item),
      });
    },

    async deleteItem(id) {
      return request(`/api/wardrobe/${id}`, { method: "DELETE" });
    },

    // ── AI Chat ──
    async chat(messages) {
      return request("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ messages }),
      });
    },

    /** Analyze a clothing item photo via Groq Vision */
    async analyzeClothing(imageDataUrl) {
      return request("/api/ai/analyze", {
        method: "POST",
        body: JSON.stringify({ imageDataUrl }),
      });
    },

    /** Analyze a body/profile photo via Groq Vision */
    async analyzeBody(imageDataUrl) {
      return request("/api/ai/body", {
        method: "POST",
        body: JSON.stringify({ imageDataUrl }),
      });
    },

    // ── Device Pairing ──
    async generatePairCode() {
      return request("/api/pair/generate", { method: "POST" });
    },

    async consumePairCode(token) {
      return request("/api/pair/consume", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
    },
  };
})();
