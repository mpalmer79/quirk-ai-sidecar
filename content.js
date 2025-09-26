// content.js  — Quirk AI Sidecar (dashboard + chat helper)
// --------------------------------------------------------

// ---- config ---------------------------------------------------------------
const API_BASE = "http://127.0.0.1:8765";
const FETCH_TIMEOUT_MS = 15000;
const MAX_CHAT_CHARS = 4000;

// ---- small utils ----------------------------------------------------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const k of kids) n.append(k);
  return n;
}

function on(elm, ev, fn, opts) { elm.addEventListener(ev, fn, opts); return () => elm.removeEventListener(ev, fn, opts); }

async function fetchJSON(url, opts) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    const txt = await res.text();
    // Try JSON; if it's plain text, wrap it.
    try { return { ok: res.ok, status: res.status, data: JSON.parse(txt) }; }
    catch { return { ok: res.ok, status: res.status, data: txt }; }
  } finally { clearTimeout(t); }
}

function copyText(s) { navigator.clipboard.writeText(s).catch(()=>{}); }

function downloadableFilename(prefix, ext = "txt") {
  const t = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${t}.${ext}`;
}

function downloadString(name, mime, content) {
  const blob = new Blob([content], { type: mime });
  const a = el("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}

// ---- mount floating bubble + panel ---------------------------------------
let panel, pre, primaryBtn, copyBtn, dlBtn, modeSpan;

function mountUI() {
  if (panel) return;

  // floating bubble
  const bubble = el("button", {
    className: "quirk-bubble",
    title: "Quirk",
    innerText: "Quirk"
  });
  Object.assign(bubble.style, {
    position: "fixed", zIndex: 2147483647, right: "18px", bottom: "18px",
    width: "48px", height: "48px", borderRadius: "50%",
    background: "#0ea5e9", color: "#fff", border: "none", fontWeight: 800,
    boxShadow: "0 6px 18px rgba(0,0,0,.2)", cursor: "pointer"
  });

  // panel
  modeSpan = el("span", { style: "color:#6b7280;margin-left:.5rem" });
  pre = el("pre", { style: "margin: .75rem 0 0; max-height: 320px; overflow: auto; background:#0b1220; color:#e5e7eb; padding:.5rem; border-radius:.5rem; font-size:12px;" });

  primaryBtn = el("button", {
    className: "quirk-primary",
    textContent: "Scrape dashboard"
  });
  Object.assign(primaryBtn.style, {
    background: "#2563eb", color: "#fff", border: "none",
    borderRadius: ".5rem", padding: ".5rem .9rem", cursor: "pointer",
    fontWeight: 600
  });

  copyBtn = el("button", { textContent: "Copy" });
  dlBtn = el("button", { textContent: "Download" });
  for (const b of [copyBtn, dlBtn]) {
    Object.assign(b.style, {
      marginLeft: ".5rem", padding: ".5rem .9rem", borderRadius: ".5rem",
      border: "1px solid #d1d5db", background: "#fff", cursor: "pointer"
    });
  }

  panel = el("div", {}, 
    el("div", {
      style: "position:fixed; right:84px; bottom:18px; width:420px; max-width:calc(100vw - 32px); background:#fff; border:1px solid #e5e7eb; border-radius:.75rem; box-shadow:0 16px 40px rgba(0,0,0,.22); z-index:2147483646; padding:12px;"
    },
      el("div", { style:"display:flex; align-items:center; gap:.5rem;" },
        el("strong", { textContent: "Quirk Helper" }),
        modeSpan,
        el("div", { style: "flex:1" }),
        primaryBtn, copyBtn, dlBtn
      ),
      pre
    )
  );

  document.documentElement.appendChild(bubble);
  document.documentElement.appendChild(panel);

  on(bubble, "click", () => {
    const box = panel.firstElementChild;
    const cur = getComputedStyle(box).display !== "none";
    box.style.display = cur ? "none" : "block";
  });

  // actions
  on(primaryBtn, "click", async () => {
    if (currentContext() === "dashboard") await doScrapeDashboard();
    else if (currentContext() === "chat") await doSuggestEdits();
    else pre.textContent = "Unknown context. Navigate to a VIN dashboard or the text chat pop-up.";
  });

  on(copyBtn, "click", () => copyText(pre.innerText));
  on(dlBtn, "click", () => downloadString(
    downloadableFilename("quirk-helper"), "text/plain", pre.innerText
  ));

  // show immediately
  updateModeLabel();
}

// ---- context detection ----------------------------------------------------
function currentContext() {
  const href = location.href.toLowerCase();

  // VIN “dealer dashboard”
  if (href.includes("/vinconnect/pane-both/vinconnect-dealer-dashboard")) return "dashboard";

  // VIN texting / communication pop-up (rims2.aspx?urlSettingName=Communication…)
  if (href.includes("rims2.aspx") && href.includes("urlsettingname=communication")) return "chat";

  // Heuristic: chat popup often has a visible send area (textarea + “Suggest Edits” button)
  const anyTextArea = document.querySelector("textarea");
  if (anyTextArea && document.body.innerText.toLowerCase().includes("your conversation will begin")) {
    return "chat";
  }

  // fallback: dashboard widgets present?
  if (document.querySelector("div:has(> div) .kpi, .vinconnect-dashboard, .sales-funnel")) return "dashboard";

  return "unknown";
}

function updateModeLabel() {
  const ctx = currentContext();
  if (!panel) return;
  if (ctx === "dashboard") {
    primaryBtn.textContent = "Scrape dashboard";
    modeSpan.textContent = "Vinconnect";
  } else if (ctx === "chat") {
    primaryBtn.textContent = "Suggest edits";
    modeSpan.textContent = "Vinconnect";
  } else {
    primaryBtn.textContent = "Detecting…";
    modeSpan.textContent = "";
  }
}

// ---- DASHBOARD SCRAPER (same idea you already have, kept concise) ---------
function readInt(el, fallback = null) {
  if (!el) return fallback;
  const m = el.textContent.replace(/[, ]+/g, "").match(/-?\d+/);
  return m ? parseInt(m[0], 10) : fallback;
}

function findByLabel(container, label) {
  const lab = Array.from(container.querySelectorAll("*")).find(n =>
    n.textContent.trim().toLowerCase() === label.toLowerCase()
  );
  if (!lab) return null;
  // number usually in sibling or parent’s prominent box
  const box = lab.closest("div,li,section") || lab.parentElement;
  const strongNum = box.querySelector("strong, .kpi-number, .value, .ng-binding");
  return strongNum || box;
}

function scrapeDashboard() {
  const root = document;

  // Sales Funnel row
  const salesRow = Array.from(root.querySelectorAll("div,section"))
    .find(n => /sales\s*funnel/i.test(n.textContent));

  const kpiRow = Array.from(root.querySelectorAll("div,section"))
    .find(n => /key\s*performance\s*indicators/i.test(n.textContent));

  const obj = {
    url: location.href,
    title: document.title,
    store: document.body.innerText.match(/Quirk Chevrolet NH|Quirk Buick GMC NH|Quirk Kia NH|Quirk Volkswagen NH/i)?.[0] || "Vinconnect",
    dateRange: (() => {
      const start = document.querySelector('input[type="text"][id*="Start"], input[type="text"][aria-label*="start"]')?.value;
      const end   = document.querySelector('input[type="text"][id*="End"], input[type="text"][aria-label*="end"]')?.value;
      return start && end ? `${start} – ${end}` : (document.querySelector("button[title='Today'], .kpi-date")?.textContent || "");
    })(),
    salesFunnel: {},
    kpis: {},
  };

  // Sales funnel (Customers, Contacted, Appts Set, Appts Shown, Sold)
  if (salesRow) {
    obj.salesFunnel.customers   = readInt(findByLabel(salesRow, "Customers"));
    obj.salesFunnel.contacted   = readInt(findByLabel(salesRow, "Contacted"));
    obj.salesFunnel.apptsSet    = readInt(findByLabel(salesRow, "Appts Set"));
    obj.salesFunnel.apptsShown  = readInt(findByLabel(salesRow, "Appts Shown"));
    obj.salesFunnel.sold        = readInt(findByLabel(salesRow, "Sold"));
  }

  // KPIs (Unanswered Comms, Open Visits, Buying Signals, Pending Deals)
  if (kpiRow) {
    obj.kpis.unansweredComms = readInt(findByLabel(kpiRow, "Unanswered Comms"));
    obj.kpis.openVisits      = readInt(findByLabel(kpiRow, "Open Visits"));
    obj.kpis.buyingSignals   = readInt(findByLabel(kpiRow, "Buying Signals"));
    obj.kpis.pendingDeals    = readInt(findByLabel(kpiRow, "Pending Deals"));
  }

  return obj;
}

async function doScrapeDashboard() {
  pre.textContent = "Scraping dashboard…";
  await sleep(50);
  try {
    const payload = scrapeDashboard();
    const lines = [
      `${payload.store} — ${payload.title}`,
      `Leads:`,
      `  Customers: ${payload.salesFunnel.customers ?? "—"}`,
      `  Contacted: ${payload.salesFunnel.contacted ?? "—"}`,
      `  Appts Set: ${payload.salesFunnel.apptsSet ?? "—"}`,
      `  Shown: ${payload.salesFunnel.apptsShown ?? "—"}`,
      `  Sold: ${payload.salesFunnel.sold ?? "—"}`,
      `KPIs — Unanswered: ${payload.kpis.unansweredComms ?? "—"}, Open visits: ${payload.kpis.openVisits ?? "—"}, Buying signals: ${payload.kpis.buyingSignals ?? "—"}, Pending deals: ${payload.kpis.pendingDeals ?? "—"}`,
      `URL: ${payload.url}`
    ];
    pre.textContent = lines.join("\n");
  } catch (err) {
    pre.textContent = `Dashboard scrape error: ${String(err)}`;
  }
}

// ---- CHAT SCRAPER + SUGGESTIONS ------------------------------------------
/**
 * Try hard to extract the visible conversation from the text pop-up.
 * We intentionally use several selector strategies; whichever hits first wins.
 */
function scrapeChatConversation() {
  // Strategy 1: big scrolling area above the reply box
  const ta = document.querySelector("textarea");
  let scrollArea = null;
  if (ta) {
    let p = ta.parentElement;
    for (let i = 0; i < 6 && p; i++) {
      scrollArea = scrollArea || Array.from(p.children).find(n => {
        const s = getComputedStyle(n);
        return (s.overflowY === "auto" || s.overflowY === "scroll") && n.innerText && n.innerText.length > 40;
      });
      p = p.parentElement;
    }
  }

  // Strategy 2: generic “message bubbles”
  const bubbleSel = [
    ".message-bubble", ".msg-bubble", ".bubble", ".message-item", ".k-message", "[class*='message'] [class*='text']"
  ];
  const bubbles = bubbleSel.flatMap(sel => Array.from(document.querySelectorAll(sel)));
  const bubbleText = bubbles.map(b => b.innerText.trim()).filter(Boolean);

  let text = "";
  if (scrollArea) text = scrollArea.innerText;
  else if (bubbleText.length >= 3) text = bubbleText.join("\n\n");
  else text = document.body.innerText; // worst case

  // Trim very long content
  text = text.replace(/\u00a0/g, " ").replace(/\r/g, "");
  if (text.length > MAX_CHAT_CHARS) {
    text = text.slice(-MAX_CHAT_CHARS);
  }

  // Dealer & customer best-effort names (optional)
  const storeMatch = document.body.innerText.match(/Quirk [^\n|]+/i);
  const customerMatch = document.body.innerText.match(/Customer:\s*([^\n]+)/i);

  return {
    url: location.href,
    dealership: storeMatch ? storeMatch[0] : "Vinconnect",
    customer: customerMatch ? customerMatch[1].trim() : "",
    conversation: text.trim()
  };
}

async function callLocalSuggestions(payload) {
  // Try /suggest first
  let res = await fetchJSON(`${API_BASE}/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (res.ok) return res.data;

  // Fallback to /summarize (send a friendly envelope)
  const fallback = await fetchJSON(`${API_BASE}/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload })
  });
  if (fallback.ok) return fallback.data;

  throw new Error(`Local API error (${res.status} then ${fallback.status})`);
}

async function doSuggestEdits() {
  const ctx = scrapeChatConversation();
  if (!ctx.conversation || ctx.conversation.length < 20) {
    pre.textContent = "Could not find enough conversation text on this page.";
    return;
  }
  pre.textContent = "Asking Quirk AI for suggested replies…";

  try {
    const result = await callLocalSuggestions(ctx);
    // If server returns JSON with {suggestions:[...]} print nicely; else print raw
    if (typeof result === "object" && result && Array.isArray(result.suggestions)) {
      pre.textContent = result.suggestions.map((s, i) => `#${i + 1}\n${s}\n`).join("\n");
    } else {
      pre.textContent = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    }
  } catch (err) {
    pre.textContent = `Could not reach local API: ${String(err).replace(/^Error:\s*/, "")}`;
  }
}

// ---- init -----------------------------------------------------------------
(function init() {
  try { mountUI(); updateModeLabel(); }
  catch (e) { /* no-op */ }

  // Respond to SPA navigations / pop-up lifetime
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      updateModeLabel();
    }
  }, 600);

  // A small delay helps in heavy pages
  setTimeout(updateModeLabel, 800);
})();
