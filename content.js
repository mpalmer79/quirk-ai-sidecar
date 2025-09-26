// ---------------- Quirk AI Sidecar: content.js v0.1.4 ----------------
// Adds: 20s inactivity auto-collapse (resets on user interaction or hover).
// Also includes: route-change auto-minimize + inventory helpers (v0.1.3).

if (window.__quirkSidecarLoaded) { /* already loaded */ }
else {
  window.__quirkSidecarLoaded = true;

  // ---------------- Config ----------------
  const INACTIVITY_MS = 20000; // 20 seconds

  // ---------------- Utilities ----------------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const log = (...args) => console.log("%c[Quirk]", "color:#06c;font-weight:bold", ...args);

  // Persisted UI state (per tab)
  const State = {
    get collapsed() { return sessionStorage.getItem("quirk:collapsed") === "1"; },
    set collapsed(v) { sessionStorage.setItem("quirk:collapsed", v ? "1" : "0"); },
    setContext(ctx) { sessionStorage.setItem("quirk:ctx", ctx || "unknown"); },
    getContext() { return sessionStorage.getItem("quirk:ctx") || "unknown"; }
  };

  // ---------------- CSS ----------------
  const STYLE = `
  .quirk-pill { position: fixed; z-index: 2147483646; right: 18px; bottom: 18px;
    background:#10b981; color:white; font-weight:700; border-radius:22px;
    padding:10px 14px; box-shadow:0 6px 20px rgba(0,0,0,.18); cursor:pointer; user-select:none;
    display:flex; align-items:center; gap:10px; }
  .quirk-pill:hover{ filter:brightness(.98) }
  .quirk-panel { position: fixed; z-index: 2147483647; right: 16px; bottom: 16px; width: 400px;
    background:#fff; border-radius:16px; box-shadow:0 12px 34px rgba(0,0,0,.2);
    overflow:hidden; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial; }
  .quirk-hd { display:flex; align-items:center; gap:12px; padding:12px 14px; border-bottom:1px solid #e5e7eb; }
  .quirk-badge { background:#eef2ff; color:#4338ca; font-weight:700; border-radius:8px; padding:6px 10px; }
  .quirk-spacer { flex:1 }
  .quirk-ghost { background:#f3f4f6; border:1px solid #e5e7eb; padding:7px 10px; border-radius:10px; font-weight:600; cursor:pointer; }
  .quirk-cta { background:#2563eb; color:#fff; border:none; padding:9px 12px; font-weight:700; border-radius:12px; cursor:pointer; }
  .quirk-cta[disabled]{ opacity:.5; cursor:default }
  .quirk-body { padding:10px 14px; }
  .quirk-log { height:180px; overflow:auto; background:#0b1220; color:#d1e7ff;
    border-radius:10px; padding:10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:12px; }
  .quirk-row { display:flex; align-items:center; gap:8px; margin:8px 0; flex-wrap:wrap; }
  .quirk-input { border:1px solid #d1d5db; border-radius:10px; padding:6px 8px; }
  .quirk-chip { background:#f1f5f9; border:1px solid #e2e8f0; border-radius:999px; padding:4px 8px; }
  .quirk-muted { color:#6b7280; font-size:12px; }
  `;

  function injectStyleOnce() {
    if ($('#quirk-style')) return;
    const st = document.createElement('style');
    st.id = 'quirk-style';
    st.textContent = STYLE;
    document.head.appendChild(st);
  }

  // ---------------- Panel / Pill ----------------
  let $panel, $pill, $log, $primary, $copy, $download, $badge;
  let inactivityTimer = null;
  let hoverPanel = false;

  function ensureUI() {
    injectStyleOnce();

    // pill
    if (!$pill) {
      $pill = document.createElement('div');
      $pill.className = 'quirk-pill';
      $pill.innerHTML = `<span>Quirk</span>`;
      $pill.style.display = 'none';
      document.body.appendChild($pill);
      on($pill, 'click', () => expandPanel());
    }

    // panel
    if (!$panel) {
      $panel = document.createElement('div');
      $panel.className = 'quirk-panel';
      $panel.innerHTML = `
        <div class="quirk-hd">
          <div style="font-weight:900">Quirk Helper</div>
          <div class="quirk-badge" id="quirk-badge">Vinconnect</div>
          <div class="quirk-spacer"></div>
          <button class="quirk-ghost" id="quirk-min">Minimize</button>
        </div>
        <div class="quirk-body">
          <div class="quirk-row">
            <button class="quirk-cta" id="quirk-primary">Scrape dashboard</button>
            <button class="quirk-ghost" id="quirk-copy">Copy</button>
            <button class="quirk-ghost" id="quirk-dl">Download</button>
          </div>
          <div class="quirk-log" id="quirk-log"></div>
          <div class="quirk-muted" id="quirk-hint"></div>
        </div>`;
      document.body.appendChild($panel);

      $log = $('#quirk-log', $panel);
      $primary = $('#quirk-primary', $panel);
      $copy = $('#quirk-copy', $panel);
      $download = $('#quirk-dl', $panel);
      $badge = $('#quirk-badge', $panel);

      on($('#quirk-min', $panel), 'click', () => collapsePanel());
      on($copy, 'click', () => navigator.clipboard.writeText($log.textContent || '').catch(()=>{}));
      on($download, 'click', downloadLogBlob);

      // inactivity: pause while hovering; reset timer on enter/leave
      on($panel, 'mouseenter', () => { hoverPanel = true; resetInactivityTimer(); });
      on($panel, 'mouseleave', () => { hoverPanel = false; resetInactivityTimer(); });
    }

    // reflect collapsed state
    if (State.collapsed) {
      $panel.style.display = 'none';
      $pill.style.display = 'flex';
    } else {
      $panel.style.display = 'block';
      $pill.style.display = 'none';
      resetInactivityTimer();
    }

    // Global interactions reset inactivity timer
    const resetters = ['mousemove','mousedown','keydown','wheel','touchstart','pointerdown','focusin','scroll','click'];
    resetters.forEach(ev => on(window, ev, resetInactivityTimer, {passive:true}));
  }

  function collapsePanel() {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
    State.collapsed = true;
    if ($panel) $panel.style.display = 'none';
    if ($pill) $pill.style.display = 'flex';
  }
  function expandPanel() {
    State.collapsed = false;
    if ($panel) $panel.style.display = 'block';
    if ($pill) $pill.style.display = 'none';
    resetInactivityTimer();
  }
  function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (State.collapsed) return;
    inactivityTimer = setTimeout(() => {
      if (!hoverPanel) collapsePanel();
    }, INACTIVITY_MS);
  }

  function setPrimary(label, handler, disabled=false) {
    $primary.textContent = label;
    $primary.disabled = !!disabled;
    $primary.onclick = (e)=>{ resetInactivityTimer(); handler && handler(e); };
  }
  function logLine(s='') { $log.textContent += (s.endsWith('\n')? s : s+'\n'); $log.scrollTop = $log.scrollHeight; }
  function clearLog() { $log.textContent=''; }
  function downloadLogBlob() {
    const blob = new Blob([$log.textContent || ''], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {href:url, download:'quirk-output.txt'});
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // ---------------- Context detection ----------------
  function isDashboard() { return /vinconnect\/pane-both\/vinconnect-dealer-dashboard/i.test(location.href); }
  function isTextPopup() { return /rim?s2\.aspx\?urlSettingName=Communication/i.test(location.href); }
  function isInventory() {
    const hasInvTable = $$('table').some(t=>{
      const heads = $$('th', t).map(th => th.textContent.trim().toLowerCase());
      return heads.includes('stock #') && heads.includes('make') && heads.includes('model') && heads.includes('vin');
    });
    return /BrowseInventory/i.test(document.body.textContent || '') || hasInvTable ||
           /inventory/i.test(location.href);
  }
  function detectContext() {
    if (isDashboard()) return 'dashboard';
    if (isTextPopup()) return 'text_popup';
    if (isInventory()) return 'inventory';
    return 'unknown';
  }

  // ---------------- Dashboard scrape ----------------
  function scrapeDashboard() {
    clearLog(); resetInactivityTimer();
    logLine('Scraping dashboard...');
    try {
      const tiles = $$('.kpi-tile, .metric-tile, .card')
        .filter(el => /customers|contacted|appts|shown|sold/i.test(el.textContent||''));
      const getNum = el => (el.textContent.match(/\d+/) || ['0'])[0];
      const byLabel = label => {
        const el = tiles.find(x=> (x.textContent||'').toLowerCase().includes(label));
        return el ? getNum(el) : '0';
      };
      const funnel = {
        customers: byLabel('customer'),
        contacted: byLabel('contacted'),
        apptsSet: byLabel('appts set'),
        apptsShown: byLabel('shown'),
        sold: byLabel('sold')
      };
      const kpis = {
        unansweredComms: (document.body.textContent.match(/unanswered\s*comms[^0-9]*([0-9]+)/i)||[])[1]||'0',
        openVisits: (document.body.textContent.match(/open\s*visits[^0-9]*([0-9]+)/i)||[])[1]||'0',
        buyingSignals: (document.body.textContent.match(/buying\s*signals[^0-9]*([0-9]+)/i)||[])[1]||'0',
        pendingDeals: (document.body.textContent.match(/pending\s*deals[^0-9]*([0-9]+)/i)||[])[1]||'0',
      };
      logLine(`Vinconnect — ${document.title}`);
      logLine(`Leads:`);
      logLine(`Customers: ${funnel.customers} | Contacted: ${funnel.contacted} | Appts Set: ${funnel.apptsSet} | Shown: ${funnel.apptsShown} | Sold: ${funnel.sold}`);
      logLine(`KPIs — Unanswered: ${kpis.unansweredComms}, Open visits: ${kpis.openVisits}, Buying signals: ${kpis.buyingSignals}, Pending deals: ${kpis.pendingDeals}`);
      logLine(`URL: ${location.href}`);
    } catch (e) {
      logLine('Scrape error: ' + e.message);
    }
  }

  // ---------------- Text popup: Suggest edits ----------------
  function readConversation() {
    const bubbles = $$('*')
      .filter(el => el.className && /message|bubble|text/i.test(el.className) && (el.textContent||'').trim().length>0)
      .slice(-40);
    return bubbles.map(b => b.textContent.trim()).join('\n\n').trim();
  }
  function suggestEdits() {
    clearLog(); resetInactivityTimer();
    logLine('Reading conversation...');
    const convo = readConversation();
    if (!convo) { logLine('Nothing found.'); return; }
    logLine('Could not reach local API: Failed to fetch\n');
    logLine('Draft a concise, friendly reply to the customer based on this conversation:\n');
    logLine(convo);
  }

  // ---------------- Inventory helpers ----------------
  function buildInventoryTools() {
    clearLog(); resetInactivityTimer();
    const tables = $$('table');
    const table = tables.find(t => {
      const ths = $$('th', t).map(th => th.textContent.trim().toLowerCase());
      return ths.includes('stock #') && ths.includes('make') && ths.includes('model') && ths.includes('vin');
    });
    if (!table) { logLine('Inventory: table not found yet. Interact and try again.'); return; }

    const head = $('thead', table) || table;
    const headers = $$('th', head).map((th,i) => ({i, label: th.textContent.trim().toLowerCase()}));
    const col = (name) => (headers.find(h => h.label.includes(name)) || {}).i ?? -1;

    const ixStock = col('stock'); const ixMake = col('make'); const ixModel = col('model');
    const ixTrim = col('trim');   const ixVIN  = col('vin');  const ixAge  = headers.find(h=> /age$/.test(h.label))?.i ?? -1;
    const ixMiles= headers.find(h=> /miles/.test(h.label))?.i ?? -1; const ixPhotos = headers.find(h=> /photos/.test(h.label))?.i ?? -1;

    const rows = $$('tbody tr', table).map(tr => {
      const tds = $$('td', tr);
      const txt = i => (tds[i]?.textContent || '').trim();
      const hasPhoto = ixPhotos>=0 ? (tds[ixPhotos].textContent.match(/\d+/)?.[0]||'0') !== '0'
                                   : !!$('img', tds[0] || tr);
      return {
        el: tr,
        stock: txt(ixStock),
        make: txt(ixMake),
        model: txt(ixModel),
        trim: txt(ixTrim),
        vin: txt(ixVIN),
        age: parseInt(txt(ixAge)||'0',10),
        miles: parseInt((txt(ixMiles)||'0').replace(/,|\s/g,''),10) || 0,
        hasPhoto
      };
    });

    const body = $('.quirk-body', $panel);
    const existing = $('#quirk-inv-ui'); if (existing) existing.remove();
    const ui = document.createElement('div'); ui.id = 'quirk-inv-ui';
    ui.innerHTML = `
      <div class="quirk-row">
        <input id="q-free" class="quirk-input" placeholder="Search (VIN, stock, make, model, trim)" style="flex:1;min-width:200px">
        <input id="q-make" class="quirk-input" placeholder="Make" style="width:110px">
        <input id="q-model" class="quirk-input" placeholder="Model" style="width:120px">
        <input id="q-year-min" class="quirk-input" placeholder="Min Yr" style="width:80px">
        <input id="q-year-max" class="quirk-input" placeholder="Max Yr" style="width:80px">
      </div>
      <div class="quirk-row">
        <label class="quirk-chip"><input type="checkbox" id="q-photo" style="margin-right:6px">Photos only</label>
        <input id="q-age-max" class="quirk-input" placeholder="Max Age (days)" style="width:130px">
        <span class="quirk-muted" id="q-count"></span>
        <div class="quirk-spacer"></div>
        <button class="quirk-ghost" id="q-copy-vins">Copy VINs</button>
        <button class="quirk-ghost" id="q-dl-csv">Download CSV</button>
      </div>`;
    body.insertBefore(ui, body.firstChild.nextSibling);
    const hint = $('#quirk-hint', $panel); if (hint) hint.textContent = 'Filters apply here only. Results update live.';

    const $free = $('#q-free', ui), $make = $('#q-make', ui), $model = $('#q-model', ui),
          $yrMin = $('#q-year-min', ui), $yrMax = $('#q-year-max', ui), $ageMax = $('#q-age-max', ui),
          $photo = $('#q-photo', ui), $count = $('#q-count', ui);

    function apply() {
      resetInactivityTimer();
      const q = ($free.value||'').trim().toLowerCase();
      const mk = ($make.value||'').trim().toLowerCase();
      const md = ($model.value||'').trim().toLowerCase();
      const yMin = parseInt($yrMin.value||'0',10), yMax = parseInt($yrMax.value||'0',10);
      const aMax = parseInt($ageMax.value||'0',10), needPhoto = $photo.checked;

      let shown = 0;
      rows.forEach(r => {
        let ok = true;
        if (q) {
          const blob = `${r.vin} ${r.stock} ${r.make} ${r.model} ${r.trim}`.toLowerCase();
          ok = blob.includes(q);
        }
        if (ok && mk) ok = r.make.toLowerCase().includes(mk);
        if (ok && md) ok = r.model.toLowerCase().includes(md);
        if (ok && (yMin || yMax)) {
          const yearFromModel = parseInt((r.model.match(/\b(19|20)\d{2}\b/)||[])[0]||'0',10);
          const yr = yearFromModel || 0;
          if (yMin && yr && yr < yMin) ok = false;
          if (yMax && yr && yr > yMax) ok = false;
        }
        if (ok && aMax) ok = !r.age || r.age <= aMax;
        if (ok && needPhoto) ok = r.hasPhoto;
        r.el.style.display = ok ? '' : 'none';
        if (ok) shown++;
      });
      $count.textContent = `${shown} shown`;
    }

    ['input','change','keyup'].forEach(ev=> on(ui, ev, e=> { if (e.target.id?.startsWith('q-')) apply(); }));
    apply();

    on($('#q-copy-vins', ui), 'click', () => {
      resetInactivityTimer();
      const vins = rows.filter(r => r.el.style.display !== 'none').map(r => r.vin).filter(Boolean);
      if (!vins.length) return;
      navigator.clipboard.writeText(vins.join('\n')).then(()=> { clearLog(); logLine(`Copied ${vins.length} VIN(s) to clipboard.`); });
    });
    on($('#q-dl-csv', ui), 'click', () => {
      resetInactivityTimer();
      const vis = rows.filter(r => r.el.style.display !== 'none');
      if (!vis.length) return;
      const csv = ['stock,make,model,trim,vin,age,miles,photo'];
      vis.forEach(r => csv.push([r.stock,r.make,r.model,r.trim,r.vin,r.age,r.miles,r.hasPhoto?'1':'0'].map(x=>`"${(x||'').toString().replace(/"/g,'""')}"`).join(',')));
      const blob = new Blob([csv.join('\n')], {type:'text/csv'});
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), {href:url, download:'inventory-filter.csv'});
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      clearLog(); logLine(`Downloaded ${vis.length} row(s) to inventory-filter.csv`);
    });
  }

  // ---------------- Wiring per-context ----------------
  function wireForContext(ctx) {
    ensureUI();
    State.setContext(ctx);

    if (ctx === 'unknown') {
      setPrimary('Open', null, true);
      const hint = $('#quirk-hint', $panel);
      if (hint) hint.textContent = 'Navigate to Dashboard, Texting pop-up, or Browse Inventory.';
      clearLog();
      collapsePanel(); // auto-minimize on unsupported pages
      return;
    }

    expandPanel();
    clearLog();

    const hint = $('#quirk-hint', $panel);

    if (ctx === 'dashboard') {
      $badge.textContent = 'Vinconnect';
      setPrimary('Scrape dashboard', scrapeDashboard, false);
      if (hint) hint.textContent = 'Scrapes Sales Funnel and KPI tiles on this page.';
      logLine('Ready on: Dealer Dashboard');

    } else if (ctx === 'text_popup') {
      $badge.textContent = 'Vinconnect';
      setPrimary('Suggest edits', suggestEdits, false);
      if (hint) hint.textContent = 'Reads the conversation in this pop-up and drafts a response.';
      logLine('Ready on: Communication (Text)');

    } else if (ctx === 'inventory') {
      $badge.textContent = 'Inventory';
      setPrimary('Refresh inventory tools', buildInventoryTools, false);
      if (hint) hint.textContent = 'Client-side filters + Copy VINs + CSV export.';
      buildInventoryTools();
    }
  }

  // ---------------- Route / navigation detection ----------------
  function hookHistory() {
    const _push = history.pushState;
    const _replace = history.replaceState;
    history.pushState = function(...a){ const r = _push.apply(this,a); dispatchEvent(new Event('quirk:navigate')); return r; };
    history.replaceState = function(...a){ const r = _replace.apply(this,a); dispatchEvent(new Event('quirk:navigate')); return r; };
    on(window, 'popstate', () => dispatchEvent(new Event('quirk:navigate')));
  }
  function startURLObserver() {
    let last = location.href;
    setInterval(() => {
      if (location.href !== last) {
        last = location.href;
        dispatchEvent(new Event('quirk:navigate'));
      }
    }, 600);
  }
  function startDOMObserver() {
    const mo = new MutationObserver(() => {
      if (document.visibilityState === 'visible') maybeRewire();
    });
    mo.observe(document.documentElement, {subtree:true, childList:true});
  }
  let rewireTimer = null;
  function maybeRewire() {
    clearTimeout(rewireTimer);
    rewireTimer = setTimeout(() => {
      const ctx = detectContext();
      const prev = State.getContext();
      if (ctx !== prev) {
        log('Context change:', prev, '→', ctx);
        wireForContext(ctx);
      }
    }, 200);
  }

  // ---------------- Init ----------------
  (async function init() {
    ensureUI();
    hookHistory();
    startURLObserver();
    startDOMObserver();
    on(window, 'quirk:navigate', () => maybeRewire());
    wireForContext(detectContext());
  })();
}
