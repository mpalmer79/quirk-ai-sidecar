/* Quirk AI Sidecar – content.js (dashboard helper) */

/* ---------- small utils ---------- */
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const $one = (sel, root = document) => root.querySelector(sel);
const text = (el) => (el?.textContent || "").trim();
const toInt = (v) => {
  const m = String(v ?? "").replace(/[, ]/g, "").match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
};

/* ---------- locate a card by its heading text ---------- */
function byHeading(needle) {
  const hay = String(needle).toLowerCase();
  for (const h of $all("h1,h2,h3,h4,h5,h6,.card-title,.panel-title,header,legend,section > .title")) {
    if (text(h).toLowerCase().includes(hay)) {
      return h.closest(".card,.panel,.mat-card,section,article,div") || h.parentElement;
    }
  }
  // fallback – find any element containing the text
  for (const n of $all("div,section,article")) {
    if (text(n).toLowerCase().includes(hay)) return n;
  }
  return null;
}

/* ---------- scrapeers (VinSolutions dashboard) ---------- */
function scrapeSalesFunnel() {
  const card = byHeading("Sales Funnel");
  if (!card) return {};
  const rows = $all("div,li,span", card).map((n) => text(n)).filter(Boolean);
  // Pull first 5 integers in order that commonly appear: Customers, Contacted, Appts Set, Appts Shown, Sold
  const ints = rows.map(toInt).filter((n) => Number.isInteger(n));
  return {
    customers: ints[0] ?? null,
    contacted: ints[1] ?? null,
    apptsSet: ints[2] ?? null,
    apptsShown: ints[3] ?? null,
    sold: ints[4] ?? null
  };
}

function scrapeKPIs() {
  const card = byHeading("Key Performance Indicators");
  if (!card) return {};
  const labels = ["Unanswered Comms", "Open Visits", "Buying Signals", "Pending Deals"];
  const out = {};
  for (const label of labels) {
    const node = $all("*", card).find((n) => text(n).toLowerCase() === label.toLowerCase());
    if (node) {
      // Value is usually in a sibling/previous box
      const v = toInt(text(node.parentElement || node.previousElementSibling));
      out[label.replace(/ /g, "").replace(/([A-Z])/g, (m) => m.toLowerCase())] = v ?? null;
    }
  }
  return out;
}

function scrapeAppointments() {
  const card = byHeading("Appointments");
  if (!card) return [];
  const rows = $all("tr, .table-row, .grid-row", card);
  return rows.slice(1, 6).map((r) => {
    const cells = $all("td, .cell", r).map((c) => text(c));
    return { row: cells.join(" | ") };
  });
}

function scrapeActivity() {
  const card = byHeading("Activity");
  if (!card) return [];
  const rows = $all("tr, .table-row, .grid-row", card);
  return rows.slice(1, 6).map((r) => {
    const cells = $all("td, .cell", r).map((c) => text(c));
    return { row: cells.join(" | ") };
  });
}

function scrapeDealerDashboard() {
  const payload = {
    url: location.href,
    title: document.title,
    store: text($one('[id*="storeName"], [class*="store"], [class*="dealer"]')) || "",
    dateRange: (text($one('input[placeholder*="date"], .date-range')) || text(byHeading("This page will auto refresh"))).replace(/\s+/g, " ").trim() || "",
    salesFunnel: scrapeSalesFunnel(),
    kpis: scrapeKPIs(),
    appointments: scrapeAppointments(),
    activity: scrapeActivity()
  };
  return payload;
}

/* ---------- summary formatter (fallback if API is down) ---------- */
function formatSummary(p) {
  const k = p.kpis || {};
  const sf = p.salesFunnel || {};
  return [
    `${p.title || "Vinconnect"} — ${p.store || "Vinconnect"}`,
    `Leads: ${toInt($one('[data-qa="leads-count"]')?.textContent) ?? ""}`,
    `Contacted: ${sf.contacted ?? ""} | Appts Set: ${sf.apptsSet ?? ""} | Shown: ${sf.apptsShown ?? ""} | Sold: ${sf.sold ?? ""}`,
    `KPIs — Unanswered: ${k.unansweredComms ?? ""}, Open visits: ${k.openVisits ?? ""}, Buying signals: ${k.buyingSignals ?? ""}, Pending deals: ${k.pendingDeals ?? ""}`,
    `URL: ${p.url}`
  ].join("\n");
}

/* ---------- panel UI ---------- */
function ensurePanel() {
  let root = document.querySelector("#quirk-panel-root");
  if (root) return root;

  root = document.createElement("div");
  root.id = "quirk-panel-root";
  root.style.cssText = `
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  `;
  root.innerHTML = `
    <button id="quirk-fab" style="
      width:56px;height:56px;border-radius:28px;border:none;
      background:#0b6b3c;color:#fff;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.25);
      cursor:pointer;">Quirk</button>
    <div id="quirk-card" style="
      display:none;position:absolute; right:72px; bottom:0;
      width:380px; background:#fff; border-radius:12px; box-shadow:0 18px 48px rgba(0,0,0,.35);
      padding:14px;">
      <div style="font-weight:600; margin-bottom:8px">Quirk Helper <span style="opacity:.6;font-weight:400;">Vinconnect</span></div>
      <div style="display:flex; gap:8px; margin-bottom:8px">
        <button data-action="scrape" class="qbtn">Scrape dashboard</button>
        <button data-action="copy" class="qbtn">Copy</button>
        <button data-action="download" class="qbtn">Download</button>
      </div>
      <pre id="quirk-output" style="margin:0;max-height:220px;overflow:auto;background:#23262d;color:#dfe6ef;padding:10px;border-radius:8px;white-space:pre-wrap;"></pre>
    </div>
  `;
  document.documentElement.appendChild(root);

  for (const b of root.querySelectorAll(".qbtn")) {
    b.style.cssText = `
      padding:8px 10px;border-radius:8px;border:1px solid #ddd;background:#f6f7f9;cursor:pointer;
    `;
  }

  root.querySelector("#quirk-fab").onclick = () => {
    const card = root.querySelector("#quirk-card");
    card.style.display = card.style.display === "none" ? "block" : "none";
  };

  root.querySelector('[data-action="scrape"]').onclick = onScrape;
  root.querySelector('[data-action="copy"]').onclick = onCopy;
  root.querySelector('[data-action="download"]').onclick = onDownload;

  return root;
}

/* ---------- actions ---------- */
async function onScrape() {
  const pre = ensurePanel().querySelector("#quirk-output");
  pre.textContent = "Working…";
  const payload = scrapeDealerDashboard();

  // try local FastAPI first, then fall back to our local summary
  try {
    const res = await fetch("http://127.0.0.1:8765/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    pre.textContent = data?.summary || formatSummary(payload);
  } catch (e) {
    pre.textContent = "Could not reach local API: " + (e?.message || "Failed to fetch") + "\n\n" + formatSummary(payload);
  }
}

function onCopy() {
  const pre = ensurePanel().querySelector("#quirk-output");
  navigator.clipboard.writeText(pre.textContent || "");
}

function onDownload() {
  const pre = ensurePanel().querySelector("#quirk-output");
  const blob = new Blob([pre.textContent || ""], { type: "text/plain" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: "quirk-dashboard.txt"
  });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- boot ---------- */
function boot() {
  ensurePanel();
  // Message from background (Alt+Q or toolbar)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "quirk:toggle") {
      const card = ensurePanel().querySelector("#quirk-card");
      card.style.display = card.style.display === "none" ? "block" : "none";
    }
  });
}
boot();
