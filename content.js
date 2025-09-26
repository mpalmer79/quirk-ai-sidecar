// content.js — Quirk AI Sidecar (single-inject, popup-aware)

(() => {
  // Inject only in top-level pages (not iframes),
  // and only once per document.
  if (window.top !== window) return;
  if (window.__quirkHelperInjected) return;
  window.__quirkHelperInjected = true;

  const ROOT_ID = "quirk-helper-root";
  if (document.getElementById(ROOT_ID)) return;

  // ------------------------------
  // Utilities
  // ------------------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const asInt = (s) => {
    const m = String(s ?? "").match(/\b\d+\b/);
    return m ? parseInt(m[0], 10) : null;
  };
  const getText = (el) => (el ? (el.innerText || el.textContent || "").trim() : "");

  function fetchJSON(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      return res.json();
    });
  }

  // Rough DOM distance (for "nearest number" search)
  function domDistance(a, b) {
    if (!a || !b) return 1e9;
    const pa = [];
    let x = a;
    while (x) {
      pa.push(x);
      x = x.parentElement;
    }
    const pb = [];
    x = b;
    while (x) {
      pb.push(x);
      x = x.parentElement;
    }
    let i = pa.length - 1;
    let j = pb.length - 1;
    while (i >= 0 && j >= 0 && pa[i] === pb[j]) {
      i--;
      j--;
    }
    return i + j + 2;
  }

  // ------------------------------
  // Context detection
  // ------------------------------
  function detectContext() {
    const href = window.location.href;

    // Dealer dashboard
    if (/vinconnect\/pane-both\/vinconnect-dealer-dashboard/i.test(href)) {
      return "dashboard";
    }

    // VIN communication windows (texts/emails)
    const convoUrlHit =
      (/CarDashboard\/Pages\/rims2\.aspx/i.test(href) &&
        /SettingName=Communication/i.test(href)) ||
      /LeadManagement\/GenAIHost\.aspx/i.test(href) ||
      (/LeadManagement/i.test(href) && /Communication/i.test(href));

    const convoDomHit = !!document.querySelector(
      [
        '[id*="Messages"]',
        '[id*="Conversation"]',
        '[class*="conversation"]',
        '[class*="messages"]',
        '[aria-label*="conversation"]',
        '[aria-label*="messages"]',
      ].join(",")
    );

    if (convoUrlHit || convoDomHit) return "conversation";

    return null;
  }

  // ------------------------------
  // Conversation scraper
  // ------------------------------
  function scrapeConversationText() {
    const root =
      document.querySelector(
        [
          '[id*="Messages"]',
          '[id*="Conversation"]',
          '[class*="conversation"]',
          '[class*="messages"]',
          "main",
          "#content",
        ].join(",")
      ) || document.body;

    const lines = [];
    root.querySelectorAll("p,div,span,li,blockquote").forEach((node) => {
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return;

      const t = getText(node);
      if (!t) return;

      // Skip huge blobs (script dumps, etc.)
      if (t.length <= 1000 && /[A-Za-z]/.test(t)) lines.push(t);
    });

    return lines.slice(-40).join("\n");
  }

  // ------------------------------
  // Dashboard scraper (label → nearest number)
  // ------------------------------
  function findCardByHeading(text) {
    const re = new RegExp("\\b" + escRe(text) + "\\b", "i");
    const label = [...document.querySelectorAll("h1,h2,h3,h4,h5,header,legend,div,span")]
      .find((el) => re.test(getText(el)));
    if (!label) return null;

    // Bubble to a card-like ancestor
    let cur = label;
    while (cur && cur !== document.body) {
      const style = window.getComputedStyle(cur);
      if (
        /card|panel|widget|tile|box/i.test(cur.className || "") ||
        style.border ||
        style.boxShadow
      ) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return label.closest("section,article,div") || document.body;
  }

  function nearestNumberNear(el, root) {
    const inThis = (node) => {
      const t = getText(node);
      return t && /^\d+$/.test(t);
    };

    // try close siblings up & down the tree
    for (let up = el; up && up !== root; up = up.parentElement) {
      // previous siblings
      let s = up.previousElementSibling;
      let hops = 0;
      while (s && hops < 5) {
        if (inThis(s)) return getText(s);
        s = s.previousElementSibling;
        hops++;
      }
      // next siblings
      s = up.nextElementSibling;
      hops = 0;
      while (s && hops < 5) {
        if (inThis(s)) return getText(s);
        s = s.nextElementSibling;
        hops++;
      }
    }

    // fallback: closest numeric node in the card
    const digits = [...root.querySelectorAll("*")].filter((n) => /^\s*\d+\s*$/.test(getText(n)));
    if (!digits.length) return null;
    digits.sort((a, b) => domDistance(el, a) - domDistance(el, b));
    return getText(digits[0]) || null;
  }

  function getValueByLabel(container, label) {
    const re = new RegExp("\\b" + escRe(label) + "\\b", "i");
    const labelEl = [...container.querySelectorAll("*")].find((n) => re.test(getText(n)));
    if (!labelEl) return null;
    const num = nearestNumberNear(labelEl, container);
    return asInt(num);
  }

  function getDateRange() {
    // VIN uses two date inputs on dashboard
    const start =
      document.querySelector('input[type="text"][value][id*="StartDate"]') ||
      document.querySelector('input[type="text"][value][name*="StartDate"]') ||
      document.querySelector('input[type="text"][value]:nth-of-type(1)');
    const end =
      document.querySelector('input[type="text"][value][id*="EndDate"]') ||
      document.querySelector('input[type="text"][value][name*="EndDate"]') ||
      document.querySelector('input[type="text"][value]:nth-of-type(2)');

    const s = start ? start.value : "";
    const e = end ? end.value : s;
    return [s, e].filter(Boolean).join(" – ");
  }

  function scrapeDealerDashboard() {
    const salesCard = findCardByHeading("Sales Funnel") || document.body;
    const kpiCard = findCardByHeading("Key Performance Indicators") || document.body;

    const salesFunnel = {
      customers: getValueByLabel(salesCard, "Customers"),
      contacted: getValueByLabel(salesCard, "Contacted"),
      apptsSet: getValueByLabel(salesCard, "Appts Set"),
      apptsShown: getValueByLabel(salesCard, "Appts Shown"),
      sold: getValueByLabel(salesCard, "Sold"),
    };

    const kpis = {
      unansweredComms: getValueByLabel(kpiCard, "Unanswered Comms"),
      openVisits: getValueByLabel(kpiCard, "Open Visits"),
      buyingSignals: getValueByLabel(kpiCard, "Buying Signals"),
      pendingDeals: getValueByLabel(kpiCard, "Pending Deals"),
    };

    return {
      url: window.location.href,
      title: "Vinconnect",
      store: "Quirk Helper",
      dateRange: getDateRange(),
      salesFunnel,
      kpis,
    };
  }

  function summarizeDashboard(obj) {
    const s = obj.salesFunnel || {};
    const k = obj.kpis || {};
    return [
      "Vinconnect — Vinconnect",
      "Leads:",
      `Customers: ${s.customers ?? "—"} | Contacted: ${s.contacted ?? "—"} | Appts Set: ${s.apptsSet ?? "—"} | Shown: ${s.apptsShown ?? "—"} | Sold: ${s.sold ?? "—"}`,
      `KPIs — Unanswered: ${k.unansweredComms ?? "—"}, Open visits: ${k.openVisits ?? "—"}, Buying signals: ${k.buyingSignals ?? "—"}, Pending deals: ${k.pendingDeals ?? "—"}`,
      `URL: ${obj.url}`,
    ].join("\n");
  }

  // ------------------------------
  // Local API bridge
  // ------------------------------
  async function sendToLocalAPI(body) {
    try {
      const data = await fetchJSON("http://127.0.0.1:8765/summarize", body);
      return data; // {summary: "..."} expected
    } catch (err) {
      return { error: String(err) };
    }
  }

  // ------------------------------
  // UI
  // ------------------------------
  const style = document.createElement("style");
  style.textContent = `
#${ROOT_ID} { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; }
#${ROOT_ID} .quirk-fab { background: #0b7a4b; color: #fff; width: 56px; height: 56px; border-radius: 50%; box-shadow: 0 6px 18px rgba(0,0,0,.2); display:flex; align-items:center; justify-content:center; cursor:pointer; font-weight:700; }
#${ROOT_ID} .panel { position: absolute; right: 72px; bottom: 0; width: 420px; background:#fff; border-radius:12px; box-shadow: 0 18px 40px rgba(0,0,0,.25); border:1px solid rgba(0,0,0,.08); overflow:hidden; }
#${ROOT_ID} .hdr { display:flex; align-items:center; gap:12px; padding:12px 14px; border-bottom:1px solid rgba(0,0,0,.07); }
#${ROOT_ID} .hdr .title { font-weight:800; }
#${ROOT_ID} .hdr .sub { color:#778; font-size:12px; }
#${ROOT_ID} .actions { margin-left:auto; display:flex; gap:8px; }
#${ROOT_ID} .btn { padding:9px 14px; border-radius:10px; border:1px solid rgba(0,0,0,.1); background:#fff; cursor:pointer; font-weight:600; }
#${ROOT_ID} .btn.primary { background:#2563eb; color:#fff; border-color:#1e4fd3; }
#${ROOT_ID} pre { margin:0; padding:10px 12px; max-height:220px; overflow:auto; background:#0b1220; color:#dfe8f7; font-size:12.5px; }
#${ROOT_ID} .bar { height:8px; background:#0b1220; margin:8px 12px; border-radius:6px; position:relative; overflow:hidden; }
#${ROOT_ID} .bar::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg, #1e3a8a, #0ea5e9, #22c55e); transform:translateX(-70%); animation: qslide 1.6s linear infinite; }
@keyframes qslide { 0% { transform: translateX(-70%);} 100% { transform: translateX(100%);} }
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = ROOT_ID;

  root.innerHTML = `
    <div class="panel" style="display:none">
      <div class="hdr">
        <div>
          <div class="title">Quirk Helper</div>
          <div class="sub">Vinconnect</div>
        </div>
        <div class="actions">
          <button class="btn primary" data-action="primary">Scrape dashboard</button>
          <button class="btn" data-action="copy">Copy</button>
          <button class="btn" data-action="download">Download</button>
        </div>
      </div>
      <div class="bar"></div>
      <pre id="quirk-pre">{idle}</pre>
    </div>
    <div class="quirk-fab" title="Quirk">Quirk</div>
  `;
  document.body.appendChild(root);

  const panel = root.querySelector(".panel");
  const fab = root.querySelector(".quirk-fab");
  const pre = root.querySelector("#quirk-pre");
  const primaryBtn = root.querySelector('[data-action="primary"]');

  function togglePanel() {
    const isOpen = panel.style.display !== "none";
    panel.style.display = isOpen ? "none" : "block";
    if (!isOpen) updatePrimaryButtonText();
  }

  function updatePrimaryButtonText() {
    const ctx = detectContext();
    primaryBtn.textContent = ctx === "conversation" ? "Suggest edits" : "Scrape dashboard";
  }

  fab.addEventListener("click", togglePanel);

  // Actions
  root.querySelector('[data-action="copy"]').addEventListener("click", async () => {
    await navigator.clipboard.writeText(pre.textContent || "");
    pre.textContent += "\n(copied)";
  });

  root.querySelector('[data-action="download"]').addEventListener("click", () => {
    const blob = new Blob([pre.textContent || ""], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "quirk-output.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  primaryBtn.addEventListener("click", () => handlePrimaryAction(pre));

  async function handlePrimaryAction(preEl) {
    const ctx = detectContext();
    updatePrimaryButtonText();

    if (ctx === "dashboard") {
      preEl.textContent = "Scraping dashboard...";
      const payload = scrapeDealerDashboard();

      // try local API first
      const api = await sendToLocalAPI({ payload }).catch(() => null);
      if (api && api.summary) {
        preEl.textContent = api.summary;
      } else {
        preEl.textContent =
          "Could not reach local API: Failed to fetch\n\n" + summarizeDashboard(payload);
      }
      return;
    }

    if (ctx === "conversation") {
      preEl.textContent = "Reading conversation...";
      const convo = scrapeConversationText();
      if (!convo || convo.length < 10) {
        preEl.textContent = "Could not read conversation text on this page.";
        return;
      }

      const body = {
        type: "conversation",
        url: window.location.href,
        content: convo,
      };

      const api = await sendToLocalAPI({ payload: body }).catch(() => null);
      if (api && api.summary) {
        preEl.textContent = api.summary;
      } else {
        // Fallback: simple helper prompt
        preEl.textContent =
          "Could not reach local API: Failed to fetch\n\n" +
          "Draft a concise, friendly reply to the customer based on this conversation:\n\n" +
          convo.slice(-1500);
      }
      return;
    }

    preEl.textContent =
      "Unknown context. Open dealer dashboard or a VIN text/email pop-up.";
  }

  // Open panel on first inject so users see the state, then close
  // (optional – comment out if you prefer closed by default)
  // panel.style.display = "block";
  // setTimeout(() => (panel.style.display = "none"), 2000);
})();
