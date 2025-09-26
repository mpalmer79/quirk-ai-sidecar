// =====================
// Quirk AI Sidecar - content.js
// Paste this whole file over your existing content.js
// =====================
(() => {
  // ---------- small utils ----------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const normTxt = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const onlyDigits = (s) => {
    const m = (s || "").trim().match(/^\d{1,4}$/); // 1–4 digits
    return m ? parseInt(m[0], 10) : null;
  };
  const isVisible = (el) => {
    if (!el || !(el instanceof Element)) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    if (!el.offsetParent && cs.position !== "fixed") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  // ---------- section locators ----------
  function findSectionRoot(labelAliases) {
    // Try to find an element whose text equals one of the aliases, and use a nearby ancestor as "section root".
    const all = Array.from(document.querySelectorAll("*")).filter(isVisible);
    for (const el of all) {
      const t = normTxt(el.textContent);
      for (const alias of labelAliases) {
        if (t === normTxt(alias)) {
          // climb a bit to get a card/container that holds the grid of tiles
          let p = el;
          for (let i = 0; i < 6 && p && p.parentElement; i++) {
            p = p.parentElement;
            // A heuristic: stop when this ancestor has multiple children and some numbers inside
            const nums = Array.from(p.querySelectorAll("*"))
              .filter(e => isVisible(e) && onlyDigits(e.textContent) !== null);
            if (nums.length >= 2) return p;
          }
          return el.parentElement || document.body;
        }
      }
    }
    // fallback: whole document
    return document.body;
  }

  // ---------- number extraction near a label ----------
  function findNearestNumberInContainer(container, labelEl) {
    // Prefer numbers inside same container; fallback to whole document
    const pool = (container && container.querySelectorAll)
      ? Array.from(container.querySelectorAll("*"))
      : Array.from(document.querySelectorAll("*"));

    const candidates = pool.filter(el => {
      if (!isVisible(el)) return false;
      const val = onlyDigits(el.textContent);
      return val !== null;
    });

    if (!candidates.length) return null;

    const L = labelEl.getBoundingClientRect();
    let best = null;
    let bestScore = Infinity;

    for (const c of candidates) {
      const R = c.getBoundingClientRect();
      // distance center-to-center
      const dx = (R.left + R.width / 2) - (L.left + L.width / 2);
      const dy = (R.top + R.height / 2) - (L.top + L.height / 2);

      // Slight bias for numbers to the left (common layout for tiles)
      const sideBias = (R.left < L.left ? 0 : 50);
      const score = dx * dx + dy * dy + sideBias;

      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best ? onlyDigits(best.textContent) : null;
  }

  // get the number "nearest to" a label, with aliases and fallbacks
  function getNumberNearLabel(sectionRoot, labelTextOrList) {
    const labels = Array.isArray(labelTextOrList) ? labelTextOrList : [labelTextOrList];
    const all = Array.from(sectionRoot.querySelectorAll("*")).filter(isVisible);
    let labelEls = [];

    // exact match pass
    for (const aliasRaw of labels) {
      const alias = normTxt(aliasRaw);
      const found = all.filter(el => normTxt(el.textContent) === alias);
      if (found.length) { labelEls = found; break; }
    }
    // contains() pass
    if (!labelEls.length) {
      for (const aliasRaw of labels) {
        const alias = normTxt(aliasRaw);
        const found = all.filter(el => normTxt(el.textContent).includes(alias));
        if (found.length) { labelEls = found; break; }
      }
    }
    if (!labelEls.length) return 0;

    const labelEl = labelEls[0];

    // Try: previous siblings first (common "number tile left of label" layout)
    let sib = labelEl.previousElementSibling;
    for (let i = 0; i < 3 && sib; i++) {
      const n = onlyDigits(sib.textContent);
      if (n !== null) return n;
      sib = sib.previousElementSibling;
    }

    // Search inside the same container
    const inContainer = findNearestNumberInContainer(sectionRoot, labelEl);
    if (inContainer !== null) return inContainer;

    // Fallback: entire document nearest number
    const anywhere = findNearestNumberInContainer(document.body, labelEl);
    return anywhere !== null ? anywhere : 0;
  }

  // ---------- label maps (with aliases) ----------
  const salesMap = {
    customers:  ["Customers", "Customer", "Cust"],
    contacted:  ["Contacted"],
    apptsSet:   ["Appts Set", "Appointments Set"],
    apptsShown: ["Appts Shown", "Appointments Shown"],
    sold:       ["Sold"]
  };

  const kpiMap = {
    unansweredComms: ["Unanswered Comms", "Unanswered Communications"],
    openVisits:      ["Open Visits"],
    buyingSignals:   ["Buying Signals"],
    pendingDeals:    ["Pending Deals"]
  };

  // ---------- scraping ----------
  function scrapeDealerDashboard() {
    // find section roots by their headings
    const salesRoot = findSectionRoot(["Sales Funnel"]);
    const kpiRoot   = findSectionRoot(["Key Performance Indicators", "Key Performance Indicator", "KPI"]);

    const salesFunnel = {
      customers:  getNumberNearLabel(salesRoot, salesMap.customers),
      contacted:  getNumberNearLabel(salesRoot, salesMap.contacted),
      apptsSet:   getNumberNearLabel(salesRoot, salesMap.apptsSet),
      apptsShown: getNumberNearLabel(salesRoot, salesMap.apptsShown),
      sold:       getNumberNearLabel(salesRoot, salesMap.sold),
    };

    const kpis = {
      unansweredComms: getNumberNearLabel(kpiRoot, kpiMap.unansweredComms),
      openVisits:      getNumberNearLabel(kpiRoot, kpiMap.openVisits),
      buyingSignals:   getNumberNearLabel(kpiRoot, kpiMap.buyingSignals),
      pendingDeals:    getNumberNearLabel(kpiRoot, kpiMap.pendingDeals),
    };

    // try to grab store name (best effort / optional)
    let store = "";
    const storeCand = Array.from(document.querySelectorAll("header *,[id*=dealer],[class*=dealer],[class*=store]"))
      .find(el => isVisible(el) && /quirk|chevrolet|buick|gmc|kia|volkswagen|vw|dealer/i.test(el.textContent));
    if (storeCand) store = storeCand.textContent.trim();

    const title = document.title || "Vinconnect";
    return {
      url: location.href,
      title,
      store,
      salesFunnel,
      kpis
    };
  }

  // ---------- summary format ----------
  function makeSummary(payload) {
    const sf = payload.salesFunnel || {};
    const kp = payload.kpis || {};
    const lines = [];

    lines.push(`${payload.title} — Vinconnect ${payload.store ? `| ${payload.store}` : ""}`);
    lines.push(`Leads:`);
    lines.push(`  Customers: ${sf.customers ?? 0} | Contacted: ${sf.contacted ?? 0} | Appts Set: ${sf.apptsSet ?? 0} | Shown: ${sf.apptsShown ?? 0} | Sold: ${sf.sold ?? 0}`);
    lines.push(`KPIs — Unanswered: ${kp.unansweredComms ?? 0} , Open visits: ${kp.openVisits ?? 0} , Buying signals: ${kp.buyingSignals ?? 0} , Pending deals: ${kp.pendingDeals ?? 0}`);
    lines.push(`URL: ${payload.url}`);
    return lines.join("\n");
  }

  // ---------- panel UI ----------
  function ensurePanel() {
    if (document.getElementById("quirk-helper-panel")) return;

    const btn = document.createElement("button");
    btn.id = "quirk-fab";
    btn.textContent = "Quirk";
    Object.assign(btn.style, {
      position: "fixed", right: "24px", bottom: "24px",
      zIndex: 2147483647, borderRadius: "9999px",
      width: "56px", height: "56px", border: "0",
      color: "#fff", background: "#19734a", boxShadow:"0 6px 16px rgba(0,0,0,.25)",
      fontWeight: 700, cursor: "pointer"
    });

    const panel = document.createElement("div");
    panel.id = "quirk-helper-panel";
    Object.assign(panel.style, {
      position: "fixed", right: "24px", bottom: "88px",
      width: "360px", maxHeight: "380px", overflow: "hidden",
      background: "#fff", color: "#111", borderRadius: "12px",
      boxShadow: "0 16px 40px rgba(0,0,0,.3)", zIndex: 2147483647,
      border: "1px solid #e5e7eb", display: "none"
    });

    panel.innerHTML = `
      <div style="padding:12px 14px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:8px;">
        <strong style="font-weight:600;">Quirk Helper</strong>
        <span style="opacity:.6;font-size:12px;">Vinconnect</span>
        <div style="flex:1;"></div>
        <button data-action="scrape" style="background:#0ea5e9;border:0;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;">Scrape dashboard</button>
        <button data-action="copy"   style="margin-left:8px;background:#e5e7eb;border:0;border-radius:8px;padding:6px 10px;cursor:pointer;">Copy</button>
        <button data-action="dl"     style="margin-left:8px;background:#e5e7eb;border:0;border-radius:8px;padding:6px 10px;cursor:pointer;">Download</button>
      </div>
      <pre id="quirk-output" style="margin:0;padding:12px;max-height:300px;overflow:auto;font:12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;background:#0b1220;color:#d1e0ff;border-top:1px solid #e5e7eb;">(idle)</pre>
    `;

    const headerBtn = panel.querySelector('[data-action="scrape"]');
    const copyBtn   = panel.querySelector('[data-action="copy"]');
    const dlBtn     = panel.querySelector('[data-action="dl"]');
    const out       = panel.querySelector("#quirk-output");

    headerBtn.onclick = async () => {
      try {
        out.textContent = "Scraping…";
        await sleep(50);
        const payload = scrapeDealerDashboard();
        const summary = makeSummary(payload);
        out.textContent = summary;

        // Optional: try local API (shows result or error line)
        try {
          const res = await fetch("http://127.0.0.1:8765/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payload })
          });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const txt = await res.text();
          out.textContent = summary + "\n\n---\nLocal API response:\n" + txt;
        } catch (e) {
          out.textContent = "Could not reach local API: " + (e.message || "Failed to fetch") + "\n\n" + out.textContent;
        }
      } catch (err) {
        out.textContent = "Error: " + (err?.message || String(err));
      }
    };

    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(out.textContent || "");
        copyBtn.textContent = "Copied!";
        await sleep(800);
        copyBtn.textContent = "Copy";
      } catch {}
    };

    dlBtn.onclick = () => {
      const blob = new Blob([out.textContent || ""], { type: "text/plain" });
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(blob),
        download: "quirk-dashboard.txt"
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    btn.onclick = () => {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    };

    document.body.appendChild(btn);
    document.body.appendChild(panel);
  }

  // show panel once DOM is ready
  const ready = () => document.readyState === "interactive" || document.readyState === "complete";
  const boot = async () => {
    for (let i = 0; i < 50 && !ready(); i++) await sleep(100);
    ensurePanel();
  };
  boot();

  // Respond to Alt+Q (from background) to toggle panel
  chrome.runtime.onMessage?.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "quirk:toggle") {
      const panel = document.getElementById("quirk-helper-panel");
      if (panel) panel.style.display = (panel.style.display === "none") ? "block" : "none";
      sendResponse?.({ ok: true });
    }
    if (msg?.type === "quirk:log") {
      console.log("[from background]", msg.data);
      sendResponse?.({ ok: true });
    }
  });
})();
