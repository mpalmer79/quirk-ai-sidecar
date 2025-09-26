/* Quirk AI Sidecar – content.js (dashboard helper) */

/* ---------- small utils ---------- */
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const text = el => (el?.textContent || "").trim();
const toInt = v => {
  const m = String(v ?? "").replace(/[, ]/g, "").match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
};
const byHeading = (needle) => {
  const hay = needle.toLowerCase();
  // try common heading tags first
  for (const h of $all("h1,h2,h3,h4,h5,h6,.card-title,.panel-title,header,legend,section > .title")) {
    if (text(h).toLowerCase().includes(hay)) {
      // climb to a reasonable container/card
      return h.closest(".card,.panel,.mat-card,section,article,div") || h.parentElement;
    }
  }
  // fallback: any node that contains the phrase
  for (const n of $all("div,section,article")) {
    if (text(n).toLowerCase().includes(hay) && n.querySelector("*")) return n;
  }
  return null;
};

/* ---------- scraping ---------- */
function scrapeSalesFunnel() {
  const card = byHeading("Sales Funnel");
  if (!card) return null;
  // Robust fallback: grab the first 5 integers in the card’s text
  const nums = (text(card).match(/\d+/g) || []).map(n => parseInt(n, 10));
  const [customers, contacted, apptsSet, apptsShown, sold] = nums;
  return { customers, contacted, apptsSet, apptsShown, sold };
}

function scrapeKPIs() {
  const card = byHeading("Key Performance Indicators");
  if (!card) return null;
  const nums = (text(card).match(/\d+/g) || []).map(n => parseInt(n, 10));
  // order on your screen: Unanswered, Open Visits, Buying Signals, Pending Deals
  const [unansweredComms, openVisits, buyingSignals, pendingDeals] = nums;
  return { unansweredComms, openVisits, buyingSignals, pendingDeals };
}

function scrapeAppointments() {
  const table = byHeading("Appointments");
  if (!table) return [];
  // very light parse: read the appointment rows if they exist
  const rows = $all("tr", table).slice(1, 8); // skip header, cap short list
  return rows.map(tr => {
    const cols = $all("td", tr).map(td => text(td));
    // best effort: time, rep, customer
    return { time: cols[0], rep: cols[1], customer: cols[2] };
  }).filter(r => r.time || r.customer);
}

function scrapeActivity() {
  const block = byHeading("Activity");
  if (!block) return [];
  const rows = $all("tr", block).slice(1, 10);
  return rows.map(tr => {
    const cols = $all("td", tr).map(td => text(td));
    return { rep: cols[0], ups: cols[1], cls: cols[2], emls: cols[3], texts: cols[4], tsks: cols[5], sld: cols[6] };
  }).filter(r => r.rep);
}

/* The main payload we send to the local API */
function scrapeDealerDashboard() {
  return {
    url: location.href,
    title: document.title,
    store: text(document.querySelector('[data-qa="dealer-name"], .enterprise, .dealer, .header') || document.querySelector("title")),
    dateRange: (() => {
      const a = document.querySelector("input[aria-label='Start date'], input[placeholder*='Start']");
      const b = document.querySelector("input[aria-label='End date'], input[placeholder*='End']");
      const left = text(a) || a?.value || "";
      const right = text(b) || b?.value || "";
      return left && right ? `${left} – ${right}` : (left || right || "");
    })(),
    salesFunnel: scrapeSalesFunnel(),
    kpis: scrapeKPIs(),
    appointments: scrapeAppointments(),
    activity: scrapeActivity()
  };
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
      background:#0b6b3c;color:#fff;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer
    ">Quirk</button>
    <div id="quirk-card" style="
      display:none; width: 400px; max-height: 420px; overflow:auto;
      background:#fff; border-radius:12px; box-shadow:0 8px 28px rgba(0,0,0,.35);
      padding:12px; margin-bottom:8px
    ">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="font-weight:700">Quirk Helper</div>
        <div style="opacity:.6;font-size:12px">${text(document.querySelector('.enterprise')) || 'Vinconnect'}</div>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:8px">
        <button data-action="scrape" style="background:#0b6b3c;color:#fff;border:none;padding:8px 10px;border-radius:8px;cursor:pointer">Scrape dashboard</button>
        <button data-action="copy"   style="background:#e6eef2;color:#111;border:none;padding:8px 10px;border-radius:8px;cursor:pointer">Copy</button>
        <button data-action="download" style="background:#e6eef2;color:#111;border:none;padding:8px 10px;border-radius:8px;cursor:pointer">Download</button>
      </div>
      <pre id="quirk-pre" style="white-space:pre-wrap; font-size:12px; line-height:1.35; margin:0"></pre>
    </div>
  `;
  document.body.appendChild(root);

  const fab = root.querySelector("#quirk-fab");
  const card = root.querySelector("#quirk-card");
  fab.onclick = () => card.style.display = card.style.display === "none" ? "block" : "none";
  return root;
}

function downloadJSON(obj, name = "quirk-dashboard.json") {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  a.click(); URL.revokeObjectURL(a.href);
}
function copyJSON(obj) {
  navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
}

/* Call the local API and show a human-friendly result (or a clear error) */
async function sendToLocalAPI(payload, preEl) {
  preEl.textContent = "Sending to local API…";
  try {
    const resp = await fetch("http://127.0.0.1:8765/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload })
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      preEl.textContent =
        `Local API error (${resp.status}).\n` +
        (data ? JSON.stringify(data, null, 2) + "\n" : "") +
        `Tip: Did you restart the FastAPI server and see /docs?`;
      return;
    }
    if (data && typeof data.summary === "string") {
      preEl.textContent = data.summary;
    } else {
      preEl.textContent = JSON.stringify(data ?? {}, null, 2);
    }
  } catch (e) {
    preEl.textContent = `Could not reach local API: ${e?.message || e}`;
  }
}

/* ---------- init ---------- */
(function init() {
  const panel = ensurePanel();
  const pre = panel.querySelector("#quirk-pre");
  const btnScrape = panel.querySelector("[data-action='scrape']");
  const btnCopy   = panel.querySelector("[data-action='copy']");
  const btnDown   = panel.querySelector("[data-action='download']");

  btnScrape.onclick = async () => {
    const payload = scrapeDealerDashboard();
    await sendToLocalAPI(payload, pre);
    // stash last payload on the element for Copy/Download
    pre._lastPayload = payload;
  };
  btnCopy.onclick = () => pre._lastPayload && copyJSON(pre._lastPayload);
  btnDown.onclick = () => pre._lastPayload && downloadJSON(pre._lastPayload);
})();
