/**
 * app.js — DRAPE application controller
 *
 * Manages UI state, onboarding flow, wardrobe rendering,
 * chat, planner, analytics, and device pairing.
 * Talks to server exclusively through API module (api.js).
 */

// ══════════ STATE ══════════
const state = {
  deviceId: null,
  profile: null,
  wardrobe: [],
  chatHistory: [],
  selectedChips: {},
  itemPhotoB64: null,
  profilePhotoFull: null,
  profileAnalysis: null,
  pairInterval: null,
  isOnline: false,
};

const CAT_ICON = {
  Topwear: "👕",
  Bottomwear: "👖",
  Shoes: "👟",
  Outerwear: "🧥",
  Accessories: "⌚",
};

// ══════════ UTILITIES ══════════
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Escape HTML to prevent XSS in innerHTML injections */
function esc(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

function showSync(status) {
  const el = document.getElementById("syncIndicator");
  const dot = document.getElementById("syncDot");
  const txt = document.getElementById("syncText");
  el.classList.add("show");
  dot.className =
    "dot " +
    (status === "syncing" ? "orange" : status === "error" ? "red" : "green");
  txt.textContent =
    status === "syncing"
      ? "syncing…"
      : status === "error"
      ? "offline"
      : "synced";
  if (status !== "syncing") setTimeout(() => el.classList.remove("show"), 2500);
}

function compressImage(file, maxDim, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width,
          h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function colorNameToHex(name) {
  const map = {
    white: "#f5f5f5",
    black: "#1a1a1a",
    navy: "#1e3a5f",
    blue: "#3b82f6",
    lightblue: "#93c5fd",
    red: "#ef4444",
    burgundy: "#7f1d1d",
    maroon: "#6b2132",
    green: "#22c55e",
    sage: "#7a9b76",
    olive: "#6b7c3a",
    khaki: "#c8b468",
    beige: "#e8d5b7",
    cream: "#fdf8e8",
    camel: "#c2956c",
    brown: "#8b5e3c",
    tan: "#d2a679",
    grey: "#9ca3af",
    gray: "#9ca3af",
    charcoal: "#4b5563",
    yellow: "#fbbf24",
    mustard: "#d97706",
    orange: "#f97316",
    pink: "#ec4899",
    lavender: "#a78bfa",
    purple: "#8b5cf6",
    terracotta: "#c4622d",
    rust: "#b45309",
  };
  const lower = (name || "").toLowerCase().replace(/\s+/g, "").split("/")[0];
  for (const k in map) {
    if (lower.includes(k)) return map[k];
  }
  return "#c8b468";
}

// ══════════ BOOT SEQUENCE ══════════
async function boot() {
  const loadBar = document.getElementById("loadBar");
  const loadStatus = document.getElementById("loadStatus");
  const loadDeviceId = document.getElementById("loadDeviceId");

  // Step 1: Device identity
  loadBar.style.width = "20%";
  loadStatus.textContent = "Generating device identity…";
  state.deviceId = API.getDeviceId();
  loadDeviceId.textContent = `Device: ${state.deviceId.slice(0, 8)}…`;
  await sleep(250);

  // Step 2: Try connecting to server
  loadBar.style.width = "40%";
  loadStatus.textContent = "Connecting to server…";

  let serverOnline = false;
  try {
    const health = await API.health();
    if (health.status === "ok") serverOnline = true;
  } catch (_) {}

  if (serverOnline) {
    // ── Online mode: load from DB ──
    loadBar.style.width = "65%";
    loadStatus.textContent = "Loading profile…";
    try {
      const profileData = await API.getProfile();
      state.profile = profileData.profile;
    } catch (e) {
      console.warn("[boot] Profile load failed:", e.message);
    }

    loadBar.style.width = "85%";
    loadStatus.textContent = "Loading wardrobe…";
    try {
      const wardrobeData = await API.getWardrobe();
      state.wardrobe = wardrobeData.items || [];
    } catch (_) {
      state.wardrobe = [];
    }

    state.isOnline = true;
  } else {
    // ── Offline mode: skip DB, use local-only ──
    loadBar.style.width = "80%";
    loadStatus.textContent = "Offline mode — data won't persist";
    state.isOnline = false;
    await sleep(600);
  }

  loadBar.style.width = "100%";
  loadStatus.textContent = state.profile
    ? "Welcome back!"
    : "Let's get started!";
  await sleep(400);

  // Dismiss loading screen → show onboarding or app
  document.getElementById("loadingScreen").classList.add("fade");
  setTimeout(() => {
    document.getElementById("loadingScreen").style.display = "none";
    if (state.profile) {
      launchApp();
    } else {
      document.getElementById("onboarding").classList.add("show");
    }
  }, 400);
}

// ══════════ LAUNCH APP ══════════
function launchApp() {
  document.getElementById("onboarding").classList.remove("show");
  document.getElementById("app").classList.add("visible");
  updateHeroName();
  updateNavAvatar();
  renderWardrobe();
  renderAnalytics();
  loadProfilePage();
  showSync("synced");
}

// ══════════ ONBOARDING ══════════
function goObStep(n) {
  if (n === 3) {
    const name = document.getElementById("ob-name").value.trim();
    if (!name) {
      showToast("Please enter your name to continue");
      document.getElementById("ob-name").focus();
      return;
    }
  }
  document
    .querySelectorAll(".ob-step")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById("ob-step-" + n).classList.add("active");
  window.scrollTo(0, 0);
}

function selectChip(el, group) {
  const container = el.closest(".chip-group");
  container
    .querySelectorAll(".chip-pill")
    .forEach((c) => c.classList.remove("selected"));
  el.classList.add("selected");
  state.selectedChips[group] = el.textContent.trim();
}

function handleProfilePhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  compressImage(file, 600, 0.7).then((dataUrl) => {
    const zone = document.getElementById("profilePhotoZone");
    zone.innerHTML = `<img src="${dataUrl}" alt="Profile"/><div class="photo-overlay"><span>🔄 Change</span></div>`;
    zone.classList.add("has-photo");
    state.profilePhotoFull = dataUrl;

    // Trigger AI body analysis via server
    analyzeProfileBody(dataUrl);
  });
}

async function analyzeProfileBody(dataUrl) {
  try {
    const data = await API.analyzeBody(dataUrl);
    if (data.analysis) {
      state.profileAnalysis = data.analysis;
      // Auto-fill build dropdown
      if (data.analysis.build) {
        const sel = document.getElementById("ob-build");
        for (const o of sel.options) {
          if (
            o.value &&
            data.analysis.build
              .toLowerCase()
              .includes(
                o.value.toLowerCase().split(" ")[0].split("/")[0].trim()
              )
          ) {
            sel.value = o.value;
            break;
          }
        }
      }
      // Auto-select skin tone chip
      if (data.analysis.skin_tone) {
        const chips = document.querySelectorAll("#skinChips .chip-pill");
        chips.forEach((c) => {
          if (
            c.textContent.toLowerCase() ===
            data.analysis.skin_tone.toLowerCase()
          ) {
            c.click();
          }
        });
      }
    }
  } catch (_) {
    // Silent fail — photo analysis is optional
  }
}

async function finishOnboarding() {
  const name = document.getElementById("ob-name").value.trim();
  if (!name) {
    goObStep(2);
    showToast("Please tell us your name first");
    return;
  }

  const btn = document.getElementById("finishBtn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  state.profile = {
    name,
    age: document.getElementById("ob-age").value || null,
    gender: document.getElementById("ob-gender").value,
    height: document.getElementById("ob-height").value,
    build: document.getElementById("ob-build").value,
    skin: state.selectedChips["skin"] || "",
    style: state.selectedChips["style"] || "",
    lifestyle: document.getElementById("ob-lifestyle").value,
    location: document.getElementById("ob-location").value,
    photo: state.profilePhotoFull || null,
    photoAnalysis: state.profileAnalysis || null,
  };

  try {
    if (state.isOnline) {
      showSync("syncing");
      await API.saveProfile(state.profile);
      showSync("synced");
    }
    launchApp();
  } catch (e) {
    showSync("error");
    showToast("Save failed: " + e.message + " — continuing offline");
    launchApp();
  }
}

// ══════════ NAVIGATION ══════════
function showPage(name, tabEl) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-tab")
    .forEach((t) => t.classList.remove("active"));
  document.getElementById("page-" + name).classList.add("active");
  if (tabEl) tabEl.classList.add("active");
  if (name === "analytics") renderAnalytics();
  if (name === "profile") loadProfilePage();
}

function updateHeroName() {
  const p = state.profile;
  if (!p) return;
  const h = new Date().getHours();
  const g =
    h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const heroName = document.getElementById("heroName");
  const heroG = document.getElementById("heroGreeting");
  if (heroName) heroName.innerHTML = `${g}, <em>${esc(p.name)}</em>`;
  if (heroG) heroG.textContent = "What are you wearing today?";
}

function updateNavAvatar() {
  const av = document.getElementById("navAvatar");
  if (!av) return;
  const p = state.profile;
  if (p && p.photo) av.innerHTML = `<img src="${p.photo}" alt="avatar"/>`;
  else if (p && p.name) av.textContent = p.name[0].toUpperCase();
}

// ══════════ CHAT ══════════
function buildSystemPrompt() {
  const p = state.profile || {};
  const wStr = state.wardrobe.length
    ? state.wardrobe
        .map(
          (i) =>
            `- ${i.name} (${i.category}, ${i.color}, ${i.occasion}, ${i.season})`
        )
        .join("\n")
    : "No items yet.";

  const analysis = p.photoAnalysis;

  return `You are DRAPE, an elegant personal AI stylist. You give warm, specific, actionable fashion advice.

USER:
Name: ${p.name || "—"} | Age: ${p.age || "—"} | Gender: ${
    p.gender || "—"
  } | Height: ${p.height || "—"}
Build: ${p.build || "—"} | Skin Tone: ${p.skin || "—"} | Style: ${
    p.style || "—"
  }
Lifestyle: ${p.lifestyle || "—"} | Location: ${p.location || "—"}
${
  analysis
    ? `AI Body Analysis: Build=${analysis.build || "—"}, Shape=${
        analysis.body_shape || "—"
      }, Fit Rec=${analysis.fit_recommendation || "—"}`
    : ""
}

WARDROBE (${state.wardrobe.length} items):
${wStr}

RULES:
- ONLY suggest wardrobe items the user actually owns. Name them exactly.
- Format outfits as: **Top:** / **Bottom:** / **Shoes:** / **Extra:**
- Be warm, personal, and encouraging. Sound like a real stylist, not a chatbot.
- Use the user's name occasionally.
- Keep responses concise but complete.`;
}

async function sendChat() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  input.style.height = "auto";

  renderMsg("user", text);
  const loadEl = renderLoader();
  document.getElementById("sendBtn").disabled = true;
  state.chatHistory.push({ role: "user", content: text });

  try {
    const messages = [
      { role: "system", content: buildSystemPrompt() },
      ...state.chatHistory.slice(-14),
    ];
    const data = await API.chat(messages);
    state.chatHistory.push({ role: "assistant", content: data.reply });
    loadEl.remove();
    renderMsg("ai", data.reply);
  } catch (e) {
    loadEl.remove();
    renderMsg("ai", "⚠ " + e.message);
  }
  document.getElementById("sendBtn").disabled = false;
}

function quickAsk(text) {
  showPage("home", document.querySelector(".nav-tab"));
  document.getElementById("chatInput").value = text;
  sendChat();
}

function renderMsg(role, text) {
  const container = document.getElementById("chatMessages");
  const row = document.createElement("div");
  row.className = "msg-row " + role;
  const p = state.profile;

  const ava = document.createElement("div");
  ava.className = "msg-ava " + (role === "ai" ? "ai-ava" : "");
  if (role === "user") {
    if (p && p.photo)
      ava.innerHTML = `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
    else ava.textContent = p ? p.name[0].toUpperCase() : "U";
  } else {
    ava.textContent = "D";
  }

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.innerHTML = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");

  row.appendChild(ava);
  row.appendChild(bubble);
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
  return row;
}

function renderLoader() {
  const container = document.getElementById("chatMessages");
  const row = document.createElement("div");
  row.className = "msg-row ai";
  row.innerHTML = `<div class="msg-ava ai-ava">D</div><div class="msg-bubble"><div class="dots"><span></span><span></span><span></span></div></div>`;
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
  return row;
}

// ══════════ WARDROBE ══════════
let wardrobeFilter = "All";

function filterWardrobe(cat, el) {
  wardrobeFilter = cat;
  document
    .querySelectorAll(".filter-pill")
    .forEach((p) => p.classList.remove("active"));
  el.classList.add("active");
  renderWardrobe();
}

function renderWardrobe() {
  const grid = document.getElementById("clothesGrid");
  if (!grid) return;
  const items =
    wardrobeFilter === "All"
      ? state.wardrobe
      : state.wardrobe.filter((i) => i.category === wardrobeFilter);

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:48px 24px;">
      <div class="empty-state-icon">${
        wardrobeFilter === "All" ? "👗" : CAT_ICON[wardrobeFilter] || "👗"
      }</div>
      <div class="empty-state-title">Nothing here yet</div>
      <div class="empty-state-sub">Tap "+ Add Item" to start building your wardrobe</div></div>`;
    return;
  }

  grid.innerHTML = items
    .map(
      (item) => `
    <div class="clothes-card">
      <div class="clothes-card-del" onclick="deleteItem(${parseInt(
        item.id,
        10
      )})">✕</div>
      ${
        item.photo
          ? `<img class="clothes-card-img" src="${item.photo}" alt="${esc(
              item.name
            )}"/>`
          : `<div class="clothes-card-placeholder">${
              CAT_ICON[item.category] || "👔"
            }</div>`
      }
      <div class="clothes-card-body">
        <div class="clothes-card-name">${esc(item.name)}</div>
        <div class="clothes-card-meta">
          <div class="color-dot" style="background:${colorNameToHex(
            item.color
          )};"></div>
          ${esc(item.color)} · ${esc(item.occasion)}
        </div>
      </div>
    </div>`
    )
    .join("");
}

async function deleteItem(id) {
  try {
    if (state.isOnline) {
      showSync("syncing");
      await API.deleteItem(id);
      showSync("synced");
    }
    state.wardrobe = state.wardrobe.filter((i) => i.id !== id);
    renderWardrobe();
    renderAnalytics();
    showToast("Item removed");
  } catch (e) {
    showSync("error");
    showToast("Delete failed: " + e.message);
  }
}

// ══════════ ADD ITEM MODAL ══════════
function openAddModal() {
  document.getElementById("addModal").classList.add("open");
  state.itemPhotoB64 = null;
  const zone = document.getElementById("itemPhotoZone");
  zone.innerHTML = `<div class="photo-zone-icon">👕</div><div class="photo-zone-text">Upload a photo of your clothing</div><div class="photo-zone-sub">AI will detect type, color & style</div><div class="photo-overlay"><span>🔄 Change Photo</span></div>`;
  zone.classList.remove("has-photo");
  document.getElementById("photoDetected").style.display = "none";
  document.getElementById("analyzingState").classList.remove("show");
  // Reset photo pane fields
  ["mi-name", "mi-color", "mi-brand"].forEach(
    (id) => (document.getElementById(id).value = "")
  );
  document.getElementById("mi-cat").selectedIndex = 0;
  document.getElementById("mi-occasion").selectedIndex = 0;
  document.getElementById("mi-season").selectedIndex = 0;
  // Reset manual pane fields
  ["mn-name", "mn-color", "mn-brand"].forEach(
    (id) => (document.getElementById(id).value = "")
  );
  document.getElementById("mn-cat").selectedIndex = 0;
  document.getElementById("mn-occasion").selectedIndex = 0;
  document.getElementById("mn-season").selectedIndex = 0;
  // Reset to photo tab
  const photoTab = document.querySelector(".upload-tab");
  if (photoTab && !photoTab.classList.contains("active")) {
    switchUploadTab("photo", photoTab);
  }
}

function closeAddModal() {
  document.getElementById("addModal").classList.remove("open");
}

function switchUploadTab(tab, el) {
  document
    .querySelectorAll(".upload-tab")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".upload-pane")
    .forEach((p) => p.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("pane-" + tab).classList.add("active");
}

async function handleItemPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  const src = await compressImage(file, 400, 0.6);
  const zone = document.getElementById("itemPhotoZone");
  zone.innerHTML = `<img src="${src}" alt="item" style="width:100%;max-height:220px;object-fit:contain;padding:8px;"/><div class="photo-overlay"><span>🔄 Change</span></div>`;
  zone.classList.add("has-photo");
  state.itemPhotoB64 = src;

  // AI clothing analysis via server proxy
  document.getElementById("analyzingState").classList.add("show");
  document.getElementById("photoDetected").style.display = "none";

  try {
    const data = await API.analyzeClothing(src);
    if (data.detected) {
      const d = data.detected;
      if (d.name) document.getElementById("mi-name").value = d.name;
      if (d.color) document.getElementById("mi-color").value = d.color;
      if (d.category) document.getElementById("mi-cat").value = d.category;
      if (d.occasion) document.getElementById("mi-occasion").value = d.occasion;
      if (d.season) document.getElementById("mi-season").value = d.season;
      document.getElementById("photoDetected").style.display = "block";
    }
  } catch (_) {
    // Silent — user can still manually fill fields
  }

  document.getElementById("analyzingState").classList.remove("show");
}

async function addItem() {
  const name = document.getElementById("mi-name").value.trim();
  if (!name) {
    showToast("Please add a name for this item");
    return;
  }

  const item = {
    name,
    category: document.getElementById("mi-cat").value,
    color: document.getElementById("mi-color").value || "Not specified",
    occasion: document.getElementById("mi-occasion").value,
    season: document.getElementById("mi-season").value,
    brand: document.getElementById("mi-brand").value,
    photo: state.itemPhotoB64 || null,
  };

  try {
    let id = Date.now(); // fallback ID for offline
    if (state.isOnline) {
      showSync("syncing");
      const res = await API.addItem(item);
      id = res.id;
      showSync("synced");
    }
    item.id = id;
    state.wardrobe.unshift(item);
    renderWardrobe();
    renderAnalytics();
    closeAddModal();
    showToast("Added to your wardrobe ✓");
  } catch (e) {
    showSync("error");
    showToast("Save failed: " + e.message);
  }
}

async function addItemManual() {
  const name = document.getElementById("mn-name").value.trim();
  if (!name) {
    showToast("Please enter an item name");
    return;
  }

  const item = {
    name,
    category: document.getElementById("mn-cat").value,
    color: document.getElementById("mn-color").value || "Not specified",
    occasion: document.getElementById("mn-occasion").value,
    season: document.getElementById("mn-season").value,
    brand: document.getElementById("mn-brand").value,
    photo: null,
  };

  try {
    let id = Date.now();
    if (state.isOnline) {
      showSync("syncing");
      const res = await API.addItem(item);
      id = res.id;
      showSync("synced");
    }
    item.id = id;
    state.wardrobe.unshift(item);
    renderWardrobe();
    renderAnalytics();
    closeAddModal();
    showToast("Added to your wardrobe ✓");
  } catch (e) {
    showSync("error");
    showToast("Save failed: " + e.message);
  }
}

// ══════════ PLANNER ══════════
async function generatePlan() {
  const event_ = document.getElementById("pl-event").value.trim();
  if (!event_) {
    showToast("Please describe the occasion");
    return;
  }
  const weather = document.getElementById("pl-weather").value;
  const time = document.getElementById("pl-time").value;
  const mood = state.selectedChips["plmood"] || "";

  const btn = document.getElementById("planBtn");
  btn.disabled = true;
  btn.textContent = "Styling…";
  document.getElementById(
    "planResult"
  ).innerHTML = `<div class="outfit-result-card"><div class="dots"><span></span><span></span><span></span></div></div>`;

  try {
    const messages = [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: `Create a complete outfit for: ${event_}. Weather: ${weather}. Time: ${time}. ${
          mood ? "Mood/Vibe: " + mood : ""
        }. Use ONLY wardrobe items I own. Be specific with item names.`,
      },
    ];
    const data = await API.chat(messages);
    document.getElementById("planResult").innerHTML = `
      <div class="outfit-result-card">
        <div class="outfit-result-title">✦ ${event_}</div>
        <div style="font-size:14px;line-height:1.8;color:var(--ink2);">
          ${data.reply
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\n/g, "<br>")}
        </div>
      </div>`;
  } catch (e) {
    document.getElementById(
      "planResult"
    ).innerHTML = `<div style="color:#ef4444;font-size:13px;padding:16px;">⚠ ${e.message}</div>`;
  }
  btn.disabled = false;
  btn.textContent = "Generate Outfit";
}

// ══════════ ANALYTICS ══════════
function renderAnalytics() {
  const w = state.wardrobe;
  const sr = document.getElementById("statsRow");
  if (!sr) return;

  const cats = [...new Set(w.map((i) => i.category))].length;
  const occ = [...new Set(w.map((i) => i.occasion))].length;
  const colors = [...new Set(w.map((i) => (i.color || "").toLowerCase()))]
    .length;

  sr.innerHTML = `
    <div class="stat-box"><div class="stat-num">${w.length}</div><div class="stat-label">Items</div></div>
    <div class="stat-box"><div class="stat-num">${cats}</div><div class="stat-label">Categories</div></div>
    <div class="stat-box"><div class="stat-num">${occ}</div><div class="stat-label">Occasions</div></div>
    <div class="stat-box"><div class="stat-num">${colors}</div><div class="stat-label">Colours</div></div>`;

  const catCount = {};
  w.forEach((i) => (catCount[i.category] = (catCount[i.category] || 0) + 1));
  const occCount = {};
  w.forEach((i) => (occCount[i.occasion] = (occCount[i.occasion] || 0) + 1));

  renderBars(catCount, "catBars");
  renderBars(occCount, "occBars");
}

function renderBars(counts, containerId) {
  const max = Math.max(...Object.values(counts), 1);
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!Object.keys(counts).length) {
    el.innerHTML = `<div style="font-size:13px;color:var(--muted);">No data yet</div>`;
    return;
  }
  el.innerHTML = Object.entries(counts)
    .map(
      ([k, v]) => `
    <div class="bar-item">
      <div class="bar-label">${k}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(
        (v / max) * 100
      )}%"></div></div>
      <div class="bar-count">${v}</div>
    </div>`
    )
    .join("");
}

async function runAnalysis() {
  if (!state.wardrobe.length) {
    showToast("Add some items to your wardrobe first");
    return;
  }
  const container = document.getElementById("aiAnalysis");
  container.innerHTML = `<div class="dots" style="margin:8px 0"><span></span><span></span><span></span></div>`;

  try {
    const messages = [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content:
          "Analyse my wardrobe. Give me: 1) What it's strong at 2) Top 3 missing essentials I should buy 3) Colour gaps 4) One versatility tip. Be specific and personal.",
      },
    ];
    const data = await API.chat(messages);
    container.innerHTML = `<div style="font-size:14px;line-height:1.8;color:var(--ink2);">${data.reply
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>")}</div>`;
  } catch (e) {
    container.innerHTML = `<div style="color:#ef4444;font-size:13px;">⚠ ${e.message}</div><button class="btn-ghost" onclick="runAnalysis()" style="margin-top:12px;">Try again</button>`;
  }
}

// ══════════ PROFILE PAGE ══════════
function loadProfilePage() {
  const p = state.profile;
  if (!p) return;
  document.getElementById("pr-name").value = p.name || "";
  document.getElementById("pr-age").value = p.age || "";
  document.getElementById("pr-gender").value = p.gender || "";
  document.getElementById("pr-height").value = p.height || "";
  document.getElementById("pr-build").value = p.build || "";
  document.getElementById("pr-skin").value = p.skin || "";
  document.getElementById("pr-style").value = p.style || "";
  document.getElementById("pr-lifestyle").value = p.lifestyle || "";
  document.getElementById("pr-location").value = p.location || "";
  document.getElementById("profileDisplayName").textContent =
    p.name || "My Profile";
  document.getElementById("profileDisplayMeta").textContent =
    [p.style, p.lifestyle].filter(Boolean).join(" · ") ||
    "Update your style details";
  document.getElementById("profileDeviceId").textContent =
    "Device: " + state.deviceId.slice(0, 12) + "…";

  const av = document.getElementById("profileAvatar");
  if (p.photo)
    av.innerHTML = `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;"/>`;
  else av.textContent = p.name ? p.name[0].toUpperCase() : "?";
}

function handleProfilePhotoEdit(e) {
  const file = e.target.files[0];
  if (!file) return;
  compressImage(file, 600, 0.7).then((src) => {
    state.profile.photo = src;
    document.getElementById(
      "profileAvatar"
    ).innerHTML = `<img src="${src}" style="width:100%;height:100%;object-fit:cover;"/>`;
    updateNavAvatar();
  });
}

async function saveProfileEdit() {
  const p = state.profile || {};
  p.name = document.getElementById("pr-name").value;
  p.age = document.getElementById("pr-age").value || null;
  p.gender = document.getElementById("pr-gender").value;
  p.height = document.getElementById("pr-height").value;
  p.build = document.getElementById("pr-build").value;
  p.skin = document.getElementById("pr-skin").value;
  p.style = document.getElementById("pr-style").value;
  p.lifestyle = document.getElementById("pr-lifestyle").value;
  p.location = document.getElementById("pr-location").value;
  state.profile = p;

  try {
    if (state.isOnline) {
      showSync("syncing");
      await API.saveProfile(p);
      showSync("synced");
    }
    updateNavAvatar();
    loadProfilePage();
    updateHeroName();
    showToast("Profile updated ✓");
  } catch (e) {
    showSync("error");
    showToast("Save failed: " + e.message);
  }
}

// ══════════ DEVICE PAIRING ══════════
function openPairModal(mode) {
  const overlay = document.getElementById("pairOverlay");
  const pairInput = document.getElementById("pairInput");
  const pairCode = document.getElementById("pairCode");
  const pairSub = document.getElementById("pairSub");
  const pairTimer = document.getElementById("pairTimer");

  overlay.classList.add("open");

  if (mode === "generate") {
    pairInput.style.display = "none";
    pairCode.textContent = "······";
    pairSub.textContent = "Generating pairing code…";
    pairTimer.textContent = "";

    API.generatePairCode()
      .then(({ token, expiresAt }) => {
        pairCode.textContent = token;
        pairCode.style.opacity = "1";
        pairSub.textContent = "Share this code to link another device";

        if (state.pairInterval) clearInterval(state.pairInterval);
        state.pairInterval = setInterval(() => {
          const remaining = Math.max(
            0,
            Math.floor((new Date(expiresAt) - Date.now()) / 1000)
          );
          const m = Math.floor(remaining / 60);
          const s = remaining % 60;
          pairTimer.textContent = `Expires in ${m}:${String(s).padStart(
            2,
            "0"
          )}`;
          if (remaining <= 0) {
            clearInterval(state.pairInterval);
            pairTimer.textContent = "Expired — generate a new code";
            pairCode.style.opacity = "0.4";
          }
        }, 1000);
      })
      .catch((e) => {
        pairSub.textContent = "Error: " + e.message;
      });
  } else {
    pairInput.style.display = "block";
    pairCode.textContent = "🔗";
    pairSub.textContent = "Enter the code from your other device";
    pairTimer.textContent = "";
    document.getElementById("pairCodeInput").value = "";
    setTimeout(() => document.getElementById("pairCodeInput").focus(), 100);
  }
}

function closePairModal() {
  document.getElementById("pairOverlay").classList.remove("open");
  if (state.pairInterval) clearInterval(state.pairInterval);
}

async function submitPairCode() {
  const code = document.getElementById("pairCodeInput").value.trim();
  if (!code || code.length < 6) {
    showToast("Enter the full 6-character code");
    return;
  }

  try {
    await API.consumePairCode(code);
    showToast("Device linked! Reloading…");
    closePairModal();

    // Reload all data from linked account
    const profileData = await API.getProfile();
    state.profile = profileData.profile;
    const wardrobeData = await API.getWardrobe();
    state.wardrobe = wardrobeData.items || [];

    if (state.profile) launchApp();
    else showToast("Linked device has no profile yet");
  } catch (e) {
    showToast("Pairing failed: " + e.message);
  }
}

// ══════════ INIT ══════════
window.addEventListener("DOMContentLoaded", () => boot());
