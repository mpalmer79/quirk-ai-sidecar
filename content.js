/***********************************************
 * Quirk AI Helper — content.js (full file)
 * --------------------------------------------
 * - Single floating panel + orb
 * - Page router with detectors for VIN pages
 * - Per-page renderers (Dashboard, Messaging popup,
 *   Inventory, Desking (stub), Customer (stub), Leads (stub))
 * - Clean minimize/restore, no duplicate panels
 ***********************************************/

/* =======================
   Constants & Utilities
======================= */

const PANEL_ID = "quirk-helper-panel";
const ORB_ID = "quirk-helper-orb";
const STYLE_ID = "quirk-helper-style";
const API_BASE = "http://127.0.0.1:8765";

function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function createEl(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "className") el.className = v;
    else if (k === "innerHTML") el.innerHTML = v;
    else el.setAttribute(k, v);
  });
  for (const child of children) el.appendChild(child);
  return el;
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
  #${ORB_ID}{
    position: fixed; right: 22px; bottom: 22px; z-index: 2147483646;
    width: 52px; height: 52px; border-radius: 26px;
    background:#0ea5e9 url(${chrome.runtime?.getURL ? chrome.runtime.getURL("icons/48.png") : "/icons/48.png"}) center/28px 28px no-repeat;
    box-shadow: 0 8px 22px rgba(2,6,23,.25); cursor: pointer; border:none;
  }
  #${ORB_ID}:hover{ transform: translateY(-1px); filter: brightness(1.05); }

  #${PANEL_ID}{
    all: initial; font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji";
    position: fixed; right: 24px; bottom: 24px; z-index: 2147483647;
    width: 520px; max-width: calc(100vw - 32px); color:#0f172a;
    background:#fff; border-radius: 16px; box-shadow: 0 24px 60px rgba(2, 6, 23, .3); overflow:hidden; border:1px solid #e2e8f0;
  }
  #${PANEL_ID} .qh-header{
    display:flex; align-items:center; gap:12px; padding:12px 14px; border-bottom:1px solid #e2e8f0; background:#f8fafc;
  }
  #${PANEL_ID} .qh-title{
    font-weight:700; letter-spacing:.2px;
    display:flex; align-items:center; gap:10px;
  }
  #${PANEL_ID} .qh-badge{ font-size:12px; color:#475569; }
  #${PANEL_ID} .qh-actions{ margin-left:auto; display:flex; gap:8px; }
  #${PANEL_ID} .qh-btn{
    border:1px solid #cbd5e1; background:#fff; border-radius:10px; padding:8px 12px; cursor:pointer; font-size:14px;
  }
  #${PANEL_ID} .qh-btn:hover{ background:#f1f5f9; }
  #${PANEL_ID} .qh-btn.primary{
    background:#2563eb; border-color:#1d4ed8; color:#fff; font-weight:600;
  }
  #${PANEL_ID} .qh-body{ padding:12px; max-height: 40vh; overflow:auto; }
  #${PANEL_ID} .qh-row{ display:flex; align-items:center; gap:10px; margin:8px 0; flex-wrap: wrap; }
  #${PANEL_ID} .qh-card{ border:1px solid #e2e8f0; border-radius:12px; padding:10px; background:#fff; }
  #${PANEL_ID} .qh-subtle{ color:#64748b; font-size:12px; }
  #${PANEL_ID} pre.qh-log{
    border:1px solid #e2e8f0; background:#0a0f1a; color:#e2e8f0;
    padding:12px; border-radius:12px; max-height:220px; overflow:auto; font-size:12px; line-height:1.45;
  }
  #${PANEL_ID} .qh-input{
    flex:1; min-width:180px; border:1px solid #cbd5e1; border-radius:10px; padding:8px 10px; font-size:14px;
  }
  @media (max-width:700px){
    #${PANEL_ID}{ width: calc(100vw - 24px); right: 12px; left: 12px; bottom: 12px; }
  }
  `;
  const style = createEl("style", { id: STYLE_ID, innerHTML: css });
  document.documentElement.appendChild(style);
}

/* =======================
   Panel + Orb
======================= */

function mountOrb() {
  addStyles();
  // No duplicate orb
  let orb = document.getElementById(ORB_ID);
  if (!orb) {
    orb = createEl("button", { id: ORB_ID, title: "Quirk" });
    orb.addEventListener("click", openPanel);
    document.documentElement.appendChild(orb);
  }
}

function openPanel() {
  if (document.getElementById(PANEL_ID)) {
    document.getElementById(PANEL_ID).style.display = "block";
    return renderByContext();
  }
  addStyles();
  const panel = createEl("section", { id: PANEL_ID });

  // Header
  const header = createEl("div", { className: "qh-header" });
  const title = createEl("div", { className: "qh-title", innerHTML: `
    <img src="${chrome.runtime?.getURL ? chrome.runtime.getURL("icons/32.png") : "/icons/32.png"}" width="18" height="18" />
    <span>Quirk Helper</span>
    <span id="qh-context" class="qh-badge">Vinconnect</span>
  `});
  const actions = createEl("div", { className: "qh-actions" });
  const primary = createEl("button", { id: "qh-primary", className: "qh-btn primary", innerHTML: "Detecting…" });
  const copyBtn = createEl("button", { id: "qh-copy", className: "qh-btn", innerHTML: "Copy" });
  const dlBtn = createEl("button", { id: "qh-dl", className: "qh-btn", innerHTML: "Download" });
  const closeBtn = createEl("button", { id: "qh-min", className: "qh-btn", innerHTML: "Minimize" });

  actions.append(primary, copyBtn, dlBtn, closeBtn);
  header.append(title, actions);

  // Body
  const body = createEl("div", { className: "qh-body", id: "qh-body" });
  const log = createEl("pre", { className: "qh-log", id: "qh-log" });
  log.textContent = "";

  body.appendChild(log);
  panel.append(header, body);
  document.documentElement.appendChild(panel);

  // Wire actions
  copyBtn.onclick = () => {
    const t = document.getElementById("qh-log")?.textContent || "";
    if (t) navigator.clipboard.writeText(t).catch(() => {});
  };
  dlBtn.onclick = () => {
    const t = document.getElementById("qh-log")?.textContent || "";
    const blob = new Blob([t], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = createEl("a", { href: url, download: "quirk-helper.txt" });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };
  document.getElementById("qh-min").onclick = minimizeToOrb;

  // First render by context
  renderByContext();
}

function minimizeToOrb() {
  const p = document.getElementById(PANEL_ID);
  if (p) p.style.display = "none";
  mountOrb();
}

/* =======================
   Local API helper
======================= */

async function callLocalAPI(path, payload) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json().catch(() => ({}));
  // try common shapes
  return data?.summary || data?.result || data?.text || JSON.stringify(data);
}

/* =======================
   Scrapers & Small helpers
======================= */

/** Normalize text */
function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }

/** Dashboard: find section by heading text */
function findSection(headingText) {
  const all = [...document.querySelectorAll("h2,h3,h4,div")];
  const match = all.find(n => /Sales Funnel|Key Performance Indicators|Internet Response Times/i.test(n.textContent || ""));
  // fallback: find container by heading match
  const head = all.find(n => (n.textContent || "").trim().toLowerCase() === headingText.toLowerCase());
  if (head) {
    // container often is parent a few levels up
    for (let i = 0, el = head; i < 5 && el; i++, el = el.parentElement) {
      const boxes = el.querySelectorAll("div,li,span");
      if (boxes.length > 10) return el;
    }
  }
  // fallback: scan cards by heading text includes
  return all.find(n => (n.textContent || "").includes(headingText)) || document.body;
}

function numberFrom(el) {
  if (!el) return null;
  const txt = (el.innerText || el.textContent || "").replace(/[, ]/g, "");
  const m = txt.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** Dashboard: robust label→number fetch within a container */
function statByLabel(container, label) {
  if (!container) return null;
  const walk = (container.innerText || "").split("\n").map(s => s.trim()).filter(Boolean);
  const idx = walk.findIndex(t => t.toLowerCase() === label.toLowerCase());
  if (idx > 0) {
    // number is often previous token (inside the green box) or next line
    let num = walk[idx - 1]; // preceding number
    let n = parseInt(String(num || "").replace(/\D+/g, ""), 10);
    if (!isFinite(n)) {
      num = walk[idx + 1];
      n = parseInt(String(num || "").replace(/\D+/g, ""), 10);
    }
    return isFinite(n) ? n : null;
  }
  // fallback: query by label substring, then nearest number
  const all = [...container.querySelectorAll("*")];
  const node = all.find(n => norm(n.textContent).toLowerCase() === label.toLowerCase());
  if (node) {
    // try previousElementSibling or previous text
    const near = node.previousElementSibling || node.parentElement?.previousElementSibling;
    const v = numberFrom(near);
    if (isFinite(v)) return v;
  }
  return null;
}

/** Dashboard readout */
function scrapeDashboard() {
  const sales = findSection("Sales Funnel");
  const kpis = findSection("Key Performance Indicators");

  const out = {
    customers: statByLabel(sales, "Customers"),
    contacted: statByLabel(sales, "Contacted"),
    apptsSet: statByLabel(sales, "Appts Set"),
    apptsShown: statByLabel(sales, "Appts Shown"),
    sold: statByLabel(sales, "Sold"),
    unansweredComms: statByLabel(kpis, "Unanswered Comms"),
    openVisits: statByLabel(kpis, "Open Visits"),
    buyingSignals: statByLabel(kpis, "Buying Signals"),
    pendingDeals: statByLabel(kpis, "Pending Deals")
  };
  return out;
}

/** Messaging popup: collect visible conversation text */
function scrapeConversation() {
  // heuristic: pull all message bubbles
  const candidates = [...document.querySelectorAll('[class*="conversation"], [class*="message"], [class*="bubble"], .panel, .card')]
    .filter(el => (el.innerText || "").length > 40);
  const longest = candidates.sort((a,b) => (b.innerText||"").length - (a.innerText||"").length)[0];
  const txt = longest ? longest.innerText : document.body.innerText;
  return norm(txt || "");
}

function buildReplyPrompt(convoText) {
  return [
    "Draft a concise, friendly reply to the customer based on this conversation:",
    "",
    convoText
  ].join("\n");
}

/** Customer summary (simple) */
function scrapeCustomerSummary() {
  const name = (document.querySelector("h1, .customer-name, [data-testid='customer-name']")?.innerText || "").trim();
  const phone = (document.querySelector("a[href^='tel:'], .phone")?.innerText || "").trim();
  const email = (document.querySelector("a[href^='mailto:']")?.innerText || "").trim();
  let txt = `Customer: ${name || "(unknown)"}\n`;
  if (phone) txt += `Phone: ${phone}\n`;
  if (email) txt += `Email: ${email}\n`;
  return txt.trim();
}

/* =======================
   Renderers
======================= */

// -------- Dashboard ----------
function renderDashboard(body) {
  document.getElementById("qh-context").textContent = "Vinconnect";
  const primary = document.getElementById("qh-primary");
  const log = document.getElementById("qh-log");
  primary.textContent = "Scrape dashboard";

  primary.onclick = () => {
    try {
      const s = scrapeDashboard();
      const lines = [];
      if (Object.values(s).some(v => typeof v === "number")) {
        lines.push("Vinconnect — Vinconnect");
        if (typeof s.customers === "number") lines.push(`Customers: ${s.customers}`);
        lines.push("Leads:");
        if (typeof s.contacted === "number") lines.push(`  Contacted: ${s.contacted}`);
        if (typeof s.apptsSet === "number") lines.push(`  Appts Set: ${s.apptsSet}`);
        if (typeof s.apptsShown === "number") lines.push(`  Shown: ${s.apptsShown}`);
        if (typeof s.sold === "number") lines.push(`  Sold: ${s.sold}`);
        lines.push("KPIs:");
        if (typeof s.unansweredComms === "number") lines.push(`  Unanswered: ${s.unansweredComms}`);
        if (typeof s.openVisits === "number") lines.push(`  Open visits: ${s.openVisits}`);
        if (typeof s.buyingSignals === "number") lines.push(`  Buying signals: ${s.buyingSignals}`);
        if (typeof s.pendingDeals === "number") lines.push(`  Pending deals: ${s.pendingDeals}`);
        lines.push(`URL: ${location.href}`);
        log.textContent = lines.join("\n");
      } else {
        log.textContent = "Could not find dashboard tiles. Scroll into view and try again.";
      }
    } catch (e) {
      log.textContent = "Failed to parse dashboard.";
    }
  };

  // Auto-run once on open to show live numbers
  primary.click();
}

// -------- Messaging popup (Suggest Edits) ----------
function renderMessenger(body) {
  document.getElementById("qh-context").textContent = "Vinconnect";
  const primary = document.getElementById("qh-primary");
  const log = document.getElementById("qh-log");
  primary.textContent = "Suggest edits";

  primary.onclick = async () => {
    try {
      const convo = scrapeConversation();
      const prompt = buildReplyPrompt(convo);
      try {
        const out = await callLocalAPI("/summarize", { note: prompt });
        log.textContent = out || prompt;
      } catch {
        log.textContent = prompt;
      }
    } catch {
      log.textContent = "Could not read the conversation on this page.";
    }
  };

  log.textContent = "Reading conversation…";
  // Don’t auto-click; let user press to avoid spamming local API
}

// -------- Inventory (quick filter/search) ----------
function renderInventoryAssistant(body) {
  document.getElementById("qh-context").textContent = "Vinconnect";
  const primary = document.getElementById("qh-primary");
  const log = document.getElementById("qh-log");
  primary.textContent = "Apply filter";
  log.textContent = "Enter a quick filter and click Apply (Make/Model/Trim/Stock/VIN).";

  // UI
  const host = createEl("div", { className: "qh-card" });
  host.innerHTML = `
    <div class="qh-row">
      <input id="qh-inv-q" class="qh-input" placeholder="e.g., 'new tahoe', 'awd lt', 'silverado work truck', '1GNE... VIN'"/>
      <button id="qh-inv-apply" class="qh-btn">Apply</button>
      <button id="qh-inv-clear" class="qh-btn">Clear</button>
    </div>
    <div class="qh-subtle">We’ll first try VIN’s native Search, otherwise fall back to client-side row filtering.</div>
  `;
  body.insertBefore(host, log);

  const q = host.querySelector("#qh-inv-q");
  const btn = host.querySelector("#qh-inv-apply");
  const clear = host.querySelector("#qh-inv-clear");

  const apply = () => {
    const val = (q.value || "").trim();
    if (!val) return;

    try {
      const native = document.querySelector('input[type="text"][name="Search"], input[placeholder*="Search"]');
      if (native) {
        native.value = val;
        native.dispatchEvent(new Event("input", { bubbles: true }));
        const searchBtn = [...document.querySelectorAll('button,input[type="button"],input[type="submit"]')]
          .find(b => /search/i.test(b.innerText) || /search/i.test(b.value || ""));
        if (searchBtn) {
          searchBtn.click();
          log.textContent = `Searching "${val}" using VIN's toolbar…`;
          return;
        }
      }
      // Fallback: filter rows
      const rows = [...document.querySelectorAll("table tr")];
      let shown = 0;
      for (const tr of rows) {
        if (!tr.innerText) continue;
        const txt = tr.innerText.toLowerCase();
        const match = val.toLowerCase().split(/\s+/).every(k => txt.includes(k));
        tr.style.display = match ? "" : "none";
        if (match) shown++;
      }
      log.textContent = `Filtered rows: showing ${shown}.`;
    } catch (e) {
      log.textContent = "Filter failed. Try VIN's native search box at the top of the table.";
    }
  };
  btn.onclick = apply;
  primary.onclick = apply;

  clear.onclick = () => {
    q.value = "";
    const rows = [...document.querySelectorAll("table tr")];
    rows.forEach(tr => tr.style.display = "");
    log.textContent = "Cleared filters.";
  };
}

// -------- Desking (stub – non-intrusive) ----------
function renderDeskTools(body) {
  document.getElementById("qh-context").textContent = "Vinconnect";
  const primary = document.getElementById("qh-primary");
  const log = document.getElementById("qh-log");
  primary.textContent = "Tools";
  log.textContent = "Desking detected. Future: payment verification, rate/term guardrails, credit prompt, doc-fee check…";

  const card = createEl("div", { className: "qh-card" });
  card.innerHTML = `
    <div class="qh-row">
      <button class="qh-btn" id="qh-desk-copy">Copy payments</button>
      <button class="qh-btn" id="qh-desk-safe">Quick sanity check</button>
    </div>
    <div class="qh-subtle">We read the visible payment boxes (P 36 / Q 36). Adjust or expand later.</div>
  `;
  body.insertBefore(card, log);

  document.getElementById("qh-desk-copy").onclick = () => {
    const t = document.body.innerText || "";
    const pay36 = (t.match(/P\s*36[\s\S]*?(\d{2,3}\.\d{2})/) || [])[1];
    const q36  = (t.match(/Q\s*36[\s\S]*?(\d{2,3}\.\d{2})/) || [])[1];
    const s = `Payments: ${pay36 ? `P36 ${pay36}` : ""}${q36 ? ` | Q36 ${q36}` : ""}`.trim();
    log.textContent = s || "Could not find visible payments.";
    if (s) navigator.clipboard.writeText(s).catch(() => {});
  };

  document.getElementById("qh-desk-safe").onclick = () => {
    log.textContent = "Sanity check (stub): verify doc fee < $700, term <= 84, trade ACV not zero, rebate not negative, etc.";
  };
}

// -------- Customer page (simple helper) ----------
function renderCustomerHelper(body) {
  document.getElementById("qh-context").textContent = "Vinconnect";
  const primary = document.getElementById("qh-primary");
  const log = document.getElementById("qh-log");
  primary.textContent = "Copy summary";
  log.textContent = "Customer page detected. Click Copy summary to grab name/phone/email.";

  primary.onclick = () => {
    const s = scrapeCustomerSummary();
    log.textContent = s || "No summary found.";
    if (s) navigator.clipboard.writeText(s).catch(() => {});
  };
}

// -------- Leads page (very light) ----------
function renderLeadsHelper(body) {
  document.getElementById("qh-context").textContent = "Vinconnect";
  const primary = document.getElementById("qh-primary");
  const log = document.getElementById("qh-log");
  primary.textContent = "Copy lead table";
  log.textContent = "Leads view detected. Copies the visible table text.";

  primary.onclick = () => {
    const tbl = document.querySelector("table");
    const txt = tbl ? tbl.innerText : "";
    log.textContent = txt || "No table detected.";
    if (txt) navigator.clipboard.writeText(txt).catch(() => {});
  };
}

/* =======================
   Router (page detection)
======================= */

function isPopup() {
  try { return !!window.opener && window.opener !== window; } catch { return false; }
}
function urlHas(re) { return re.test(location.href); }
function bodyHas(txt) {
  const t = (document.body?.innerText || "").toLowerCase();
  return t.includes(txt.toLowerCase());
}

const CONTEXTS = [
  {
    key: "desking",
    name: "Desking",
    test() {
      return urlHas(/Desking\/DeskingLoader\.ashx/i) || bodyHas("deal manager");
    },
    render: renderDeskTools
  },
  {
    key: "dashboard",
    name: "Dealer Dashboard",
    test() {
      return urlHas(/vinconnect\/pane-both\/vinconnect-dealer-dashboard/i)
        || urlHas(/vinconnect\/dealer-dashboard/i)
        || (bodyHas("sales funnel") && bodyHas("key performance indicators"));
    },
    render: renderDashboard
  },
  {
    key: "messenger",
    name: "VIN Text (popup)",
    test() {
      return isPopup() && urlHas(/rims2\.aspx.*VinWFETexing/i);
    },
    render: renderMessenger
  },
  {
    key: "inventory",
    name: "Browse Inventory",
    test() {
      return bodyHas("browse inventory") && bodyHas("stock #") && bodyHas("make") && bodyHas("model");
    },
    render: renderInventoryAssistant
  },
  {
    key: "customer",
    name: "Customer Dashboard",
    test() {
      return bodyHas("customer dashboard") && (bodyHas("key information") || bodyHas("gm customer") || bodyHas("customer information"));
    },
    render: renderCustomerHelper
  },
  {
    key: "leads",
    name: "Leads List",
    test() {
      return bodyHas("unmatched inbox") || (bodyHas("leads") && bodyHas("lead type") && bodyHas("user"));
    },
    render: renderLeadsHelper
  }
];

let CURRENT_CONTEXT = null;
let unknownTimer = null;

function detectContext() {
  for (const ctx of CONTEXTS) {
    try { if (ctx.test()) return ctx; } catch {}
  }
  return null;
}

function renderByContext() {
  if (!document.getElementById(PANEL_ID)) openPanel(); // ensure exists
  const body = document.getElementById("qh-body");
  const log = document.getElementById("qh-log");
  if (!body) return;

  const ctx = detectContext();

  if (!ctx) {
    // Unknown → show a small, self-dismissing tip, then minimize
    if (unknownTimer) clearTimeout(unknownTimer);
    body.innerHTML = "";
    const tip = createEl("div", { className: "qh-card", innerHTML: `
      <div class="qh-subtle">Not on a supported VIN page. The panel will auto-minimize shortly, or click Quirk to re-open any time.</div>
    `});
    body.appendChild(tip);
    log.textContent = "";
    unknownTimer = setTimeout(minimizeToOrb, 20000);
    CURRENT_CONTEXT = null;
    return;
  }
  if (unknownTimer) { clearTimeout(unknownTimer); unknownTimer = null; }

  if (CURRENT_CONTEXT && CURRENT_CONTEXT.key === ctx.key) return;
  CURRENT_CONTEXT = ctx;

  // Clear and render
  body.innerHTML = `<pre class="qh-log" id="qh-log"></pre>`;
  try { ctx.render(body); } catch (e) {
    const lg = document.getElementById("qh-log");
    if (lg) lg.textContent = `Render error: ${e?.message || e}`;
  }
}

/* React to navigation / DOM changes */
const onNav = debounce(() => {
  // ensure we only have one panel/orb
  const dups = [...document.querySelectorAll(`#${PANEL_ID}`)];
  if (dups.length > 1) dups.slice(1).forEach(n => n.remove());
  const orbs = [...document.querySelectorAll(`#${ORB_ID}`)];
  if (orbs.length > 1) orbs.slice(1).forEach(n => n.remove());

  mountOrb();
  // If panel is open, re-route; if minimized, do nothing until user opens
  const p = document.getElementById(PANEL_ID);
  if (p && p.style.display !== "none") renderByContext();
}, 250);

["popstate","hashchange","visibilitychange"].forEach(evt =>
  window.addEventListener(evt, onNav, { passive: true })
);

// Patch pushState/replaceState so SPA-ish transitions get noticed
(function(){
  const p = history.pushState, r = history.replaceState;
  history.pushState = function(){ p.apply(this, arguments); onNav(); };
  history.replaceState = function(){ r.apply(this, arguments); onNav(); };
})();

// Observe DOM for in-place page updates
const mo = new MutationObserver(() => onNav());
mo.observe(document.documentElement, { childList: true, subtree: true });

// Boot
mountOrb();
