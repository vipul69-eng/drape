const API = (() => {
  const K = "drape_device_id";
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  function gid() {
    let i = localStorage.getItem(K);
    if (!i) {
      i = uuid();
      localStorage.setItem(K, i);
    }
    return i;
  }
  async function rq(p, o = {}) {
    const r = await fetch(p, {
      ...o,
      headers: {
        "Content-Type": "application/json",
        "X-Device-ID": gid(),
        ...(o.headers || {}),
      },
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Request failed");
    return d;
  }
  return {
    getDeviceId: gid,
    async health() {
      const r = await fetch("/api/health");
      return r.json();
    },
    async getProfile() {
      return rq("/api/profile");
    },
    async saveProfile(p) {
      return rq("/api/profile", { method: "PUT", body: JSON.stringify(p) });
    },
    async getWardrobe() {
      return rq("/api/wardrobe");
    },
    async addItem(i) {
      return rq("/api/wardrobe", { method: "POST", body: JSON.stringify(i) });
    },
    async deleteItem(id) {
      return rq("/api/wardrobe/" + id, { method: "DELETE" });
    },
    async chat(m) {
      return rq("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ messages: m }),
      });
    },
    async genPair() {
      return rq("/api/pair/generate", { method: "POST" });
    },
    async usePair(t) {
      return rq("/api/pair/consume", {
        method: "POST",
        body: JSON.stringify({ token: t }),
      });
    },
  };
})();
