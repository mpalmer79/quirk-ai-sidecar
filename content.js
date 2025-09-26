// content.js  — Quirk Helper (Desking MVP + auto-minimize)
// --------------------------------------------------------
// This script is self-contained and safe: it never sends PII anywhere.
// It watches the page, detects VIN Desking, and mounts Desk Tools.
// If the user navigates away or is inactive, it auto-minimizes to the orb.

// ========================== Utilities ==========================
(() => {
  const PANEL_ID = 'quirk-helper-panel';
  const ORB_ID = 'quirk-helper-orb';
  const STATE = { minimized: false, lastActive: Date.now(), inactivityMs: 20000 };

  // Kill any stale copies (prevents the “double panel” issue).
  for (const el of document.querySelectorAll(`#${PANEL_ID}, #${ORB_ID}`)) el.remove();

  // Helper: debounce
  const debounce = (fn, ms = 150) => {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  // Money & percent parsing
  const toNum = (v) => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    v = String(v).replace(/[\$,]/g, '').trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const toPct = (v) => {
    if (!v) return 0;
    const s = String(v).trim().replace('%', '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n / 100 : 0;
  };

  // Find a “row” (tr/div) by fuzzy label, return the nearest numeric in same row or next cell/input
  function getNumericNear(label) {
    label = label.toLowerCase();
    const candidates = Array.from(document.querySelectorAll('table, .grid, .panel, .card, body *'))
      .filter(n => n.children && n.children.length && n.textContent && n.textContent.toLowerCase().includes(label));
    let best = 0;
    for (const node of candidates.slice(0, 30)) {
      // try inputs in the same row
      const row = node.closest('tr, .row, .grid-row, .table-row') || node;
      const inputs = row.querySelectorAll('input, .value, td, .cell, .col, .amount');
      for (const el of inputs) {
        const val = el.tagName === 'INPUT' ? el.value : el.textContent;
        const num = toNum(val);
        if (num) {
          // try to pick the one NOT containing the label itself
          if (!el.textContent?.toLowerCase?.().includes(label)) {
            return num;
          }
          best = best || num;
        }
      }
    }
    return best || 0;
  }

  // Robust extraction for Desking
  function readDeskingDeal() {
    // Heuristic labels from VIN Desking (varies slightly per store/setup):
    const retail     = getNumericNear('retail price');        // not used in math, but nice to copy
    const selling    = getNumericNear('selling price') || getNumericNear('sale price') || getNumericNear('purchase price');
    const addons     = getNumericNear('total add-ons') || getNumericNear('add ons') || getNumericNear('aftermarket');
    const taxes      = getNumericNear('total taxes') || getNumericNear('sales tax');
    const fees       = getNumericNear('doc') + getNumericNear('title') + getNumericNear('registration') + getNumericNear('bank fee');
    const rebate     = getNumericNear('rebate') || 0;

    const cashDown   = getNumericNear('cash down') || getNumericNear('down payment') || 0;
    // “Net Trade” in VIN is already ACV-allowance/payoff math; use it if present
    const netTrade   = getNumericNear('net trade') || 0;

    // “Balance Due” in VIN usually equals Amount Financed; if found, prefer it
    const balanceDue = getNumericNear('balance due');

    const apr        = toPct(getNumericNear('rate')) || toPct(getNumericNear('apr')) || 0;
    const term       = Math.round(getNumericNear('term')) || Math.round(getNumericNear('months')) || 72;

    // Amount financed calc fallback
    let financed = balanceDue;
    if (!financed) {
      financed = selling + addons + taxes + fees - rebate - cashDown - netTrade;
      if (financed < 0) financed = 0;
    }
    // VIN screen payment (the one the tool shows) for sanity comparison:
    const screenPmt  = getNumericNear('pmt') || getNumericNear('payment') || 0;

    return {
      retail, selling, addons, taxes, fees, rebate, cashDown, netTrade,
      balanceDue: balanceDue || financed, apr, term, screenPmt
    };
  }

  // Finance formula
  function calcPayment(amount, apr, months) {
    if (!months) return 0;
    const r = apr / 12;
    if (r <= 0) return amount / months;
    return (amount * r) / (1 - Math.pow(1 + r, -months));
  }

  // Short money formatter
  const fmt = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  const fmt0 = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  // ========================== UI: Panel & Orb ==========================
  function ensureStyles() {
    if (document.getElementById('quirk-helper-styles')) return;
    const css = `
      #${PANEL_ID} {
        position: fixed; right: 24px; bottom: 24px; z-index: 2147483646;
        width: 380px; max-height: 70vh; background: #111827; color: #e5e7eb;
        border-radius: 16px; box-shadow: 0 12px 28px rgba(0,0,0,.35);
        font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial;
        display:flex; flex-direction:column; overflow:hidden; border:1px solid #374151;
      }
      #${PANEL_ID} .qh-head { display:flex; align-items:center; gap:12px; padding:10px 12px; border-bottom:1px solid #1f2937; }
      #${PANEL_ID} .qh-title { font-weight: 700; letter-spacing:.2px; }
      #${PANEL_ID} .qh-spacer{ flex:1 }
      #${PANEL_ID} button.qh-btn {
        background:#1d4ed8; border:none; color:white; padding:8px 10px; border-radius:10px; cursor:pointer;
        font-weight:600;
      }
      #${PANEL_ID} button.qh-btn.secondary { background:#374151; }
      #${PANEL_ID} button.qh-btn.ghost { background:transparent; color:#9ca3af; }
      #${PANEL_ID} .qh-body { padding:10px 12px; overflow:auto }
      #${PANEL_ID} .qh-row{ display:flex; gap:10px; align-items:center; margin:6px 0; flex-wrap:wrap }
      #${PANEL_ID} .qh-kv { display:flex; justify-content:space-between; gap:8px; padding:8px 10px; background:#0b1220; border:1px solid #1f2937; border-radius:10px }
      #${PANEL_ID} .qh-subtle { color:#9ca3af; font-size:12px }
      #${PANEL_ID} .qh-chip { background:#0b2; color:#fff; padding:2px 8px; border-radius:999px; font-size:12px; }
      #${PANEL_ID} .qh-warn { background:#b45309; }
      #${PANEL_ID} .qh-grid { width:100%; border-collapse:collapse; margin-top:8px }
      #${PANEL_ID} .qh-grid th, #${PANEL_ID} .qh-grid td { border-bottom:1px solid #1f2937; padding:6px 8px; text-align:right; }
      #${PANEL_ID} .qh-grid th:first-child, #${PANEL_ID} .qh-grid td:first-child { text-align:left }
      #${PANEL_ID} .qh-mini { font-size:12px; color:#9ca3af }
      #${PANEL_ID} .qh-slider { width:100% }
      #${PANEL_ID} .qh-cta-row { display:flex; gap:8px; margin-top:8px }
      #${PANEL_ID} .qh-close { background:transparent; color:#9ca3af; border:none; cursor:pointer; padding:4px 8px; }
      #${ORB_ID} {
        position:fixed; right:24px; bottom:24px; z-index:2147483646;
        width:56px; height:56px; border-radius:50%; background:#059669; color:#fff; display:flex; align-items:center; justify-content:center;
        font-weight:800; box-shadow: 0 12px 28px rgba(0,0,0,.35); cursor:pointer; user-select:none;
      }
    `;
    const style = document.createElement('style');
    style.id = 'quirk-helper-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function mountOrb() {
    if (document.getElementById(ORB_ID)) return;
    ensureStyles();
    const orb = document.createElement('div');
    orb.id = ORB_ID;
    orb.textContent = 'Quirk';
    orb.title = 'Open Quirk Helper';
    orb.onclick = () => {
      STATE.minimized = false;
      orb.remove();
      mountPanel(true);
    };
    document.body.appendChild(orb);
  }

  function minimizeToOrb() {
    if (STATE.minimized) return;
    const p = document.getElementById(PANEL_ID);
    if (p) p.remove();
    mountOrb();
    STATE.minimized = true;
  }

  function mountPanel(fromOrb = false) {
    ensureStyles();
    // Destroy dupes
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(ORB_ID)?.remove();
    STATE.minimized = false;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="qh-head">
        <div class="qh-title">Quirk Helper</div>
        <div class="qh-spacer"></div>
        <button class="qh-btn ghost" id="qh-min">Minimize</button>
        <button class="qh-close" id="qh-close">✕</button>
      </div>
      <div class="qh-body" id="qh-body"></div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#qh-close').onclick = () => { panel.remove(); mountOrb(); STATE.minimized = true; };
    panel.querySelector('#qh-min').onclick = () => minimizeToOrb();

    renderBody();
  }

  // ========================== Desking detection ==========================
  function inDesking() {
    const u = location.href.toLowerCase();
    if (u.includes('/desking') || u.includes('deskingleader') || u.includes('deskingloader')) return true;
    const txt = document.body?.innerText?.toLowerCase() || '';
    return txt.includes('deal manager') && txt.includes('retail price') && txt.includes('selling');
  }

  // ========================== Desk Tools ==========================
  function renderDeskTools(container) {
    const d = readDeskingDeal();
    const { selling, addons, taxes, fees, rebate, cashDown, netTrade, balanceDue, apr, term, screenPmt } = d;

    const myPmt = calcPayment(balanceDue, apr, term);
    const diff = Math.abs(myPmt - screenPmt);
    const ok = diff <= 2;

    // Payment sanity block
    const sanity = document.createElement('div');
    sanity.className = 'qh-row';
    sanity.innerHTML = `
      <div class="qh-kv" style="flex:1">
        <div>
          <div class="qh-subtle">Amount Financed</div>
          <div>${fmt(balanceDue)} <span class="qh-mini">(Selling ${fmt(selling)} + Add-ons ${fmt(addons)} + Taxes ${fmt(taxes)} + Fees ${fmt(fees)} − Rebate ${fmt(rebate)} − Down ${fmt(cashDown)} − Net Trade ${fmt(netTrade)})</span></div>
        </div>
      </div>
      <div class="qh-kv" style="flex:1">
        <div class="qh-subtle">APR / Term</div>
        <div>${(apr*100).toFixed(2)}% / ${fmt0(term)} mo</div>
      </div>
      <div class="qh-kv" style="flex:1">
        <div class="qh-subtle">Payment check</div>
        <div>
          Ours: <b>${fmt(myPmt)}</b> &nbsp;•&nbsp; Screen: <b>${fmt(screenPmt)}</b>
          <span class="qh-chip ${ok ? '' : 'qh-warn'}" style="margin-left:8px">${ok ? 'OK' : `Δ ${fmt(diff)}`}</span>
        </div>
      </div>
    `;
    container.appendChild(sanity);

    // Options grid
    const gridWrap = document.createElement('div');
    gridWrap.className = 'qh-row';
    gridWrap.innerHTML = `<div class="qh-subtle">Options (same deal, different terms/down/rate)</div>`;
    const grid = document.createElement('table');
    grid.className = 'qh-grid';
    const termChoices = [36, 48, 60, 72, 84].filter(n => n >= 24);
    const downChoices = [0, 1000, 2000, 3000];
    const rateChoices = [apr, apr + 0.01, apr + 0.02].map(a => Math.max(a, 0));

    const rows = [];
    let html = `<thead><tr><th>Scenario</th><th>Down</th><th>Rate</th><th>Term</th><th>Payment</th></tr></thead><tbody>`;
    let rowCount = 0;
    for (const t of termChoices) {
      for (const dn of downChoices) {
        const amt = Math.max(balanceDue - dn, 0);
        for (const r of rateChoices) {
          const p = calcPayment(amt, r, t);
          rows.push({ label: `T${t}/Dn${fmt0(dn)}/r${(r*100).toFixed(2)}%`, dn, r, t, p });
          html += `<tr><td>${rows.length}. ${`Option`}</td><td>${fmt(dn)}</td><td>${(r*100).toFixed(2)}%</td><td>${t}</td><td>${fmt(p)}</td></tr>`;
          if (++rowCount >= 12) break; // keep it concise
        }
        if (rowCount >= 12) break;
      }
      if (rowCount >= 12) break;
    }
    html += `</tbody>`;
    grid.innerHTML = html;
    gridWrap.appendChild(grid);

    // Copy options button
    const copyRow = document.createElement('div');
    copyRow.className = 'qh-cta-row';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'qh-btn secondary';
    copyBtn.textContent = 'Copy top 3 options';
    copyBtn.onclick = () => {
      const top3 = rows.slice(0, 3).map((r, i) =>
        `${i+1}) Down ${fmt(r.dn)} • Rate ${(r.r*100).toFixed(2)}% • ${r.t} mo • ${fmt(r.p)}`
      ).join('\n');
      navigator.clipboard.writeText(
        `Here are a few ways to structure this deal (same vehicle):\n${top3}`
      );
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy top 3 options', 1500);
    };
    gridWrap.appendChild(copyBtn);
    container.appendChild(gridWrap);

    // Sensitivity sliders
    const sens = document.createElement('div');
    sens.className = 'qh-row';
    sens.innerHTML = `
      <div class="qh-subtle">Sensitivity (how the payment changes)</div>
      <div class="qh-kv" style="width:100%">
        <div style="flex:1">
          <div class="qh-mini">Down (+/- $500 steps)</div>
          <input type="range" min="-3" max="3" step="1" value="0" class="qh-slider" id="qh-s-down">
        </div>
        <div style="flex:1">
          <div class="qh-mini">Rate (+/- 0.50%)</div>
          <input type="range" min="-2" max="2" step="1" value="0" class="qh-slider" id="qh-s-rate">
        </div>
        <div style="flex:1">
          <div class="qh-mini">Price (+/- $500)</div>
          <input type="range" min="-3" max="3" step="1" value="0" class="qh-slider" id="qh-s-price">
        </div>
      </div>
      <div id="qh-s-out" class="qh-mini" style="margin-top:6px"></div>
    `;
    container.appendChild(sens);

    const $out = sens.querySelector('#qh-s-out');
    const updateSens = () => {
      const kDown = +sens.querySelector('#qh-s-down').value;  // steps of $500
      const kRate = +sens.querySelector('#qh-s-rate').value;  // steps of 0.50%
      const kPrice= +sens.querySelector('#qh-s-price').value; // steps of $500

      const dDelta = kDown * 500;
      const rDelta = kRate * 0.005;
      const pDelta = kPrice* 500;

      const amt = Math.max((balanceDue - dDelta) + pDelta, 0);
      const newApr = Math.max(apr + rDelta, 0);
      const newPmt = calcPayment(amt, newApr, term);
      const delta = newPmt - myPmt;

      $out.textContent = `Δ Payment: ${fmt(delta)} → ${fmt(newPmt)} (Down ${dDelta >=0?'+':''}${fmt(dDelta)}, Rate ${(newApr*100).toFixed(2)}%, Price ${pDelta>=0?'+':''}${fmt(pDelta)})`;
    };
    sens.querySelectorAll('input').forEach(i => i.addEventListener('input', updateSens));
    updateSens();

    // Quick copy snapshot
    const snap = document.createElement('div');
    snap.className = 'qh-cta-row';
    const copyDeal = document.createElement('button');
    copyDeal.className = 'qh-btn';
    copyDeal.textContent = 'Copy deal snapshot';
    copyDeal.onclick = () => {
      const t = [
        `Deal snapshot`,
        `Selling: ${fmt(selling)} | Add-ons: ${fmt(addons)} | Taxes: ${fmt(taxes)} | Fees: ${fmt(fees)} | Rebate: ${fmt(rebate)}`,
        `Down: ${fmt(cashDown)} | Net Trade: ${fmt(netTrade)} | Financed: ${fmt(balanceDue)}`,
        `APR: ${(apr*100).toFixed(2)}% | Term: ${term} mo | Payment: ${fmt(myPmt)} (Screen: ${fmt(screenPmt)})`
      ].join('\n');
      navigator.clipboard.writeText(t);
      copyDeal.textContent = 'Copied!';
      setTimeout(() => copyDeal.textContent = 'Copy deal snapshot', 1500);
    };
    snap.appendChild(copyDeal);
    container.appendChild(snap);
  }

  // ========================== Body render ==========================
  function renderBody() {
    const body = document.getElementById('qh-body');
    if (!body) return;
    body.innerHTML = '';

    if (inDesking()) {
      const hdr = document.createElement('div');
      hdr.className = 'qh-row';
      hdr.innerHTML = `<div class="qh-subtle">Desk Tools · local-only • no data leaves this page</div>`;
      body.appendChild(hdr);
      renderDeskTools(body);
    } else {
      const msg = document.createElement('div');
      msg.className = 'qh-row';
      msg.innerHTML = `
        <div class="qh-kv" style="width:100%">
          <div>
            <div class="qh-subtle">Context</div>
            <div>Not on Desking. The panel will auto-minimize in 20s, or click <b>Quirk</b> to reopen any time.</div>
          </div>
        </div>`;
      body.appendChild(msg);
    }
  }

  // ========================== Activity / Auto-minimize ==========================
  const markActive = () => { STATE.lastActive = Date.now(); };
  ['mousemove','keydown','click','scroll','touchstart'].forEach(evt =>
    document.addEventListener(evt, markActive, { passive: true })
  );

  setInterval(() => {
    // If not on desking, prefer minimized state after inactivity
    const stale = Date.now() - STATE.lastActive > STATE.inactivityMs;
    if (stale && !STATE.minimized) minimizeToOrb();
  }, 1500);

  // React to URL/page changes
  const hookNav = () => {
    const push = history.pushState;
    history.pushState = function(...a) { const r = push.apply(this, a); onNav(); return r; };
    window.addEventListener('popstate', onNav);
  };
  const onNav = debounce(() => {
    // Re-render body or minimize based on context
    if (document.getElementById(PANEL_ID)) {
      renderBody();
      STATE.lastActive = Date.now();
    } else {
      // keep just the orb
      mountOrb();
    }
  }, 200);

  // Observe big DOM mutations (VIN is SPA-like in many places)
  const mo = new MutationObserver(debounce(() => {
    if (document.getElementById(PANEL_ID)) {
      renderBody();
    }
  }, 400));
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // ========================== Boot ==========================
  hookNav();
  // Start minimized to keep out of the way; user can click orb
  mountOrb();

  // Optionally auto-open when we detect Desking (handy for managers):
  const openIfDesking = () => {
    if (inDesking() && STATE.minimized) {
      mountPanel(true);
      STATE.lastActive = Date.now();
    }
  };
  setTimeout(openIfDesking, 600); // small delay so VIN builds the sheet first
})();
