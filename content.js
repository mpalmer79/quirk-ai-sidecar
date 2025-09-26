(() => {
  // ----- single-mount guards -----
  if (window.top !== window.self) return;              // ignore iframes -> fixes duplicate panels
  if (window.__quirkMounted) return;                   // only mount once per window
  window.__quirkMounted = true;

  const API_URLS = [
    "http://127.0.0.1:8765/summarize",
    "http://localhost:8765/summarize",
  ];

  const MODE = detectContext();
  const PANEL_ID = "quirk-helper-panel";
  const BAR_ID = "quirk-progress";
  let mounted = false;
  let observer;

  // ----- bootstrap -----
  mountPanel();
  watchDom();

  // ===================== helpers =====================

  function detectContext() {
    const href = location.href.toLowerCase();
    // VIN texting popup (Comms window)
    const texting =
      href.includes("communication.vinwfetextingbase") ||
      document.querySelector('#pnlSMSChatHistory, [id*="pnlSMSChatHistory"]') ||
      document.querySelector('textarea[maxlength="1200"], textarea[aria-label*="1200"]');

    // Main Dealer Dashboard
    const dashboard =
      href.includes("/vinconnect/pane-both/vinconnect-dealer-dashboard") ||
      textMatches(document.body, /\bSales Funnel\b/i);

    return texting ? "texting" : dashboard ? "dashboard" : "unknown";
  }

  function textMatches(root, re) {
    try {
      return re.test(root?.innerText || "");
    } catch {
      return false;
    }
  }

  function watchDom() {
    // A very light observer to remount if panel is removed
    observer = new MutationObserver(() => {
      if (!document.getElementById(PANEL_ID)) {
        mounted = false;
        mountPanel();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function mountPanel() {
    if (mounted) return;
    const old = document.getElementById(PANEL_ID);
    if (old) old.remove();

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = `
      position: fixed; z-index: 2147483647; bottom: 16px; right: 16px;
      width: 420px; box-shadow: 0 10px 28px rgba(0,0,0,.2);
      background: #fff; border-radius: 12px; font-family: system-ui, Arial, sans-serif;
      color:#111; overflow: hidden; border: 1px solid #e7e7e7;
    `;

    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 12px 8px 12px;">
        <div style="font-weight:700;line-height:1.1">Quirk<br/><span style="font-weight:600;color:#666">Helper</span></div>
        <div style="flex:1;color:#888">Vinconnect</div>
        <button id="quirk-primary" style="
          appearance:none;border:0;background:#2563eb;color:#fff;font-weight:700;
          padding:10px 14px;border-radius:10px;cursor:pointer
        ">${MODE === "texting" ? "Suggest edits" : "Scrape dashboard"}</button>
        <button id="quirk-copy" style="margin-left:6px;padding:8px 12px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer">Copy</button>
        <button id="quirk-dl" style="margin-left:6px;padding:8px 12px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer">Download</button>
      </div>
      <div style="padding: 0 12px 12px 12px">
        <div id="${BAR_ID}" style="height:8px;background:#f2f2f2;border-radius:999px;overflow:hidden;">
          <div style="height:100%;width:0%;background:#2563eb;transition:width .25s"></div>
        </div>
        <pre id="quirk-log" style="
          margin-top:10px;height:220px;overflow:auto;white-space:pre-wrap;
          background:#0b1021;color:#c7e0ff;border-radius:10px;padding:10px;font-size:12px;
        "></pre>
      </div>
    `;

    document.documentElement.appendChild(panel);
    mounted = true;

    // wire buttons
    document.getElementById("quirk-copy").onclick = handleCopy;
    document.getElementById("quirk-dl").onclick = handleDownload;
    const primary = document.getElementById("quirk-primary");
    primary.onclick = MODE === "texting" ? handleSuggestEdits : handleScrapeDashboard;

    // default state
    if (MODE === "texting") {
      log("Reading conversation…");
    } else if (MODE === "dashboard") {
      log("Ready. Click “Scrape dashboard”.");
    } else {
      log("Unknown context. Open the dealer dashboard or the VIN text pop-up.");
    }
  }

  function setBar(pct) {
    const bar = document.getElementById(BAR_ID)?.firstElementChild;
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  function log(msg) {
    const el = document.getElementById("quirk-log");
    if (!el) return;
    const at = new Date().toLocaleTimeString();
    el.textContent = `${el.textContent ? el.textContent + "\n" : ""}${msg}`;
    el.scrollTop = el.scrollHeight;
  }

  async function handleScrapeDashboard() {
    try {
      setBar(12);
      const summary = scrapeDashboardNumbers();
      setBar(28);
      const text = renderDashboardSummary(summary);
      setBar(40);
      log(text);
      setBar(100);
    } catch (err) {
      log(`Error: ${String(err)}`);
      setBar(0);
    }
  }

  function scrapeDashboardNumbers() {
    // Fallback: parse the whole page text for tiles; this is resilient across VIN layouts.
    const t = document.body.innerText.replace(/\s+/g, " ").trim();

    function pick(label) {
      // grab the first number that immediately precedes the label
      const re = new RegExp(`(\\d+)\\s*${label}\\b`, "i");
      const m = t.match(re);
      return m ? Number(m[1]) : null;
    }

    return {
      customers: pick("Customers"),
      contacted: pick("Contacted"),
      apptsSet: pick("Appts Set"),
      apptsShown: pick("Appts Shown"),
      sold: pick("Sold"),
      unanswered: pick("Unanswered Comms"),
      openVisits: pick("Open Visits"),
      buyingSignals: pick("Buying Signals"),
      pendingDeals: pick("Pending Deals"),
      url: location.href,
      title: document.title,
      store: textMatches(document.body, /\bQuirk\b/i) ? "Quirk Helper" : "",
      dateRange: grabDateRange()
    };
  }

  function grabDateRange() {
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input'));
    const start = inputs.find(i => /start|begin/i.test(i.placeholder || i.ariaLabel || "") || i.id.toLowerCase().includes("start"));
    const end   = inputs.find(i => /end/i.test(i.placeholder || i.ariaLabel || "") || i.id.toLowerCase().includes("end"));
    if (start && end && start.value && end.value) return `${start.value} – ${end.value}`;
    return "";
    }

  function renderDashboardSummary(s) {
    return [
      `Vinconnect — ${s.store || "Vinconnect"}`,
      `Leads:`,
      `Customers: ${nz(s.customers)} | Contacted: ${nz(s.contacted)} | Appts Set: ${nz(s.apptsSet)} | Shown: ${nz(s.apptsShown)} | Sold: ${nz(s.sold)}`,
      `KPIs — Unanswered: ${nz(s.unanswered)}, Open visits: ${nz(s.openVisits)}, Buying signals: ${nz(s.buyingSignals)}, Pending deals: ${nz(s.pendingDeals)}`,
      `URL: ${s.url}`,
    ].join("\n");
  }

  function nz(n) { return Number.isFinite(n) ? n : 0; }

  async function handleSuggestEdits() {
    try {
      setBar(15);
      const convo = scrapeConversation();
      setBar(35);

      // Compose a clean, minimal prompt for the local API
      const prompt = [
        "Draft a concise, friendly reply to the customer based on this conversation:",
        "",
        convo,
      ].join("\n");

      // Keep the prompt visible even if the API is offline
      log(prompt);
      setBar(50);

      // Try both API URLs
      let ok = false;
      for (const url of API_URLS) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payload: { note: prompt } }),
          });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const data = await res.json();
          if (data && (data.summary || data.draft || data.reply)) {
            log("\n--- Suggested reply ---\n" + (data.summary || data.draft || data.reply));
            ok = true;
            break;
          } else {
            throw new Error("Unexpected API response shape.");
          }
        } catch (e) {
          // try the next URL
        }
      }

      if (!ok) {
        log("\nCould not reach local API: Failed to fetch");
      }
      setBar(100);
    } catch (err) {
      log(`Error: ${String(err)}`);
      setBar(0);
    }
  }

  function scrapeConversation() {
    // Try the SMS chat history container first
    const host =
      document.querySelector('#pnlSMSChatHistory, [id*="pnlSMSChatHistory"]') ||
      document.querySelector('[class*="sms"], [class*="conversation"], [class*="chat"]') ||
      document.body;

    // Common bubble selectors
    const candidates = host.querySelectorAll(`
      .bubbleText, .message, .message-text, .speech-bubble, .messageBody, .smsMessage,
      [class*="bubble"], [class*="msg"], [data-qa*="message"]
    `);

    const seen = new Set();
    const lines = [];

    for (const el of candidates) {
      const raw = (el.innerText || "").trim();
      if (!raw) continue;

      // Collapse whitespace & trim
      const txt = raw.replace(/\s+/g, " ").trim();

      // Skip system / timestamps / duplicates
      if (txt.length < 2) continue;
      const key = txt.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      // Drop very boilerplate “STOP to cancel” style footers if desired:
      if (/reply stop to cancel/i.test(txt)) continue;

      lines.push(txt);
    }

    // If we captured nothing (layout fallback) use body text (last resort)
    const convo = lines.length ? lines.join("\n") : document.body.innerText.trim();
    return convo;
  }

  function handleCopy() {
    const el = document.getElementById("quirk-log");
    navigator.clipboard.writeText(el?.textContent || "").then(
      () => log("\nCopied."),
      () => log("\nCopy failed (clipboard permissions).")
    );
  }

  function handleDownload() {
    const el = document.getElementById("quirk-log");
    const blob = new Blob([el?.textContent || ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: MODE === "texting" ? "quirk-suggested-reply.txt" : "quirk-dashboard.txt",
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
})();
