// ===== Quirk AI Sidecar (MV3 content script) =====

/* -------------------- Utilities -------------------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phoneRx = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

/** Safe innerText getter */
function text(el){ return (el?.innerText || el?.textContent || "").trim(); }

/** Copy helper with visual feedback */
async function copyText(btn, value){
  try {
    await navigator.clipboard.writeText(value);
    const prev = btn.innerText;
    btn.innerText = "Copied!";
    btn.disabled = true;
    setTimeout(()=>{ btn.innerText = prev; btn.disabled = false; }, 1000);
  } catch (e){
    console.warn("Clipboard failed", e);
    alert("Could not copy to clipboard.");
  }
}

/* -------------------- Panel Injection -------------------- */
let root, shadow, ui;

function ensurePanel(){
  if (ui) return ui;

  root = document.createElement("div");
  root.id = "qai-sidecar-root";
  root.style.position = "fixed";
  root.style.top = "80px";
  root.style.right = "12px";
  root.style.zIndex = "2147483000";           // above most UIs
  root.style.width = "380px";
  root.style.maxWidth = "90vw";

  shadow = root.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    .panel {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      box-shadow: 0 10px 24px rgba(0,0,0,.12);
      overflow: hidden;
    }
    .hdr {
      display:flex; align-items:center; justify-content:space-between;
      padding:10px 12px; background:#0b6e37; color:#fff; font-weight:800;
    }
    .hdr .title { font-size: 14px; letter-spacing:.2px; }
    .hdr .btn {
      appearance:none; border:none; color:#0b6e37; background:#fff; font-weight:800;
      border-radius:8px; padding:6px 10px; cursor:pointer; line-height:1;
    }
    .body { padding: 12px; display:grid; gap:10px; }
    .kvs { display:grid; grid-template-columns: 1fr; gap:6px; }
    .kv { display:grid; grid-template-columns: 110px 1fr; gap:8px; font-size:13px; }
    .kv .k { color:#475569; font-weight:600; }
    .kv .v { color:#0f172a; }

    .block { border-top:1px solid #f1f5f9; padding-top:10px; margin-top:8px; }
    .block h4 { margin:0 0 6px; font-size:13px; color:#0b6e37; font-weight:800; }
    textarea, .mono {
      width:100%; border:1px solid #e2e8f0; border-radius:8px; padding:8px; font-size:13px; color:#0f172a;
      background:#fff; min-height:88px; resize:vertical; white-space:pre-wrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }
    .row { display:flex; gap:8px; flex-wrap:wrap; }
    .btn-ghost {
      appearance:none; border:1px solid #e2e8f0; background:#fff; color:#0f172a;
      border-radius:8px; padding:8px 10px; font-weight:700; cursor:pointer;
    }
    .toggle {
      position:fixed; top:80px; right:12px; transform: translateY(-48px);
      background:#0b6e37; color:#fff; border:none; border-radius:999px; padding:10px 12px; cursor:pointer;
      box-shadow:0 6px 16px rgba(0,0,0,.2); font-weight:800;
    }
    .hidden { display:none !important; }
  `;

  const html = document.createElement("div");
  html.innerHTML = `
    <button class="toggle" title="Toggle Quirk AI Sidecar">Q</button>
    <div class="panel">
      <div class="hdr">
        <div class="title">Quirk AI • Sidecar</div>
        <button class="btn" id="qai-hide">Hide</button>
      </div>
      <div class="body">
        <div class="kvs" id="qai-kvs"></div>

        <div class="block">
          <h4>First-touch Email</h4>
          <textarea id="qai-email"></textarea>
          <div class="row"><button class="btn-ghost" id="copy-email">Copy</button></div>
        </div>

        <div class="block">
          <h4>SMS Draft</h4>
          <textarea id="qai-sms"></textarea>
          <div class="row"><button class="btn-ghost" id="copy-sms">Copy</button></div>
        </div>

        <div class="block">
          <h4>Call / Note Template</h4>
          <textarea id="qai-note"></textarea>
          <div class="row"><button class="btn-ghost" id="copy-note">Copy</button></div>
        </div>

        <div class="block">
          <h4>Next Best Action</h4>
          <div class="mono" id="qai-nba" style="min-height:44px;"></div>
        </div>
      </div>
    </div>
  `;

  shadow.append(style, html);
  document.documentElement.appendChild(root);

  // Wire controls
  const hideBtn = shadow.getElementById("qai-hide");
  const toggle  = shadow.querySelector(".toggle");
  hideBtn.addEventListener("click", () => root.classList.add("hidden"));
  toggle.addEventListener("click", () => root.classList.toggle("hidden"));

  ui = {
    kvs: shadow.getElementById("qai-kvs"),
    email: shadow.getElementById("qai-email"),
    sms: shadow.getElementById("qai-sms"),
    note: shadow.getElementById("qai-note"),
    nba: shadow.getElementById("qai-nba"),
    copyEmail: shadow.getElementById("copy-email"),
    copySMS: shadow.getElementById("copy-sms"),
    copyNote: shadow.getElementById("copy-note")
  };

  ui.copyEmail.addEventListener("click", (e)=> copyText(e.target, ui.email.value));
  ui.copySMS.addEventListener("click",   (e)=> copyText(e.target, ui.sms.value));
  ui.copyNote.addEventListener("click",  (e)=> copyText(e.target, ui.note.value));

  return ui;
}

/* -------------------- Extraction -------------------- */
/**
 * Best-effort extraction. We try specific patterns used on
 * typical lead/customer/vehicle views, then fall back to regex
 * scanning of visible text on the page.
 */
function extractLead(){
  const out = {
    name: "",
    email: "",
    phone: "",
    vehicle: "",
    source: "",
  };

  // 1) Try common selectors (adjust as you learn DOM structure)
  const selectors = [
    '[data-test*="customer-name"]',
    '.customer-name',
    'label:contains("Customer") ~ *',
    'label:contains("Name") ~ *'
  ];

  // Lightweight :contains polyfill for querySelectorAll (scan labels)
  function findByLabelContains(word){
    const labels = Array.from(document.querySelectorAll("label, .label, th, dt, .field-label"));
    const match = labels.find(l => text(l).toLowerCase().includes(word));
    if (match){
      // next sibling or parent row value
      let v = match.nextElementSibling || match.parentElement?.querySelector("input, select, textarea, .value, td, dd");
      return text(v);
    }
    return "";
  }

  // Name/email/phone via straightforward guesses
  out.name  = findByLabelContains("name") || out.name;
  out.email = (findByLabelContains("email") || "").match(emailRx)?.[0] || "";
  out.phone = (findByLabelContains("phone") || "").match(phoneRx)?.[0] || "";

  // Vehicle guesses (YMM or VIN row/summary)
  let veh = findByLabelContains("vehicle") || findByLabelContains("year") || "";
  if (!veh) {
    // look for a summary header containing Y/M/Mo
    const hdrs = Array.from(document.querySelectorAll("h1,h2,h3,.title,.header"));
    const pick = hdrs.map(h=>text(h)).find(t => /\b(19|20)\d{2}\b/.test(t));
    veh = pick || "";
  }
  out.vehicle = veh;

  // Source (lead source or provider)
  out.source = findByLabelContains("source") || findByLabelContains("provider") || "";

  // 2) Fallback: regex across visible text
  const bodyText = document.body ? text(document.body) : "";
  if (!out.email){
    out.email = (bodyText.match(emailRx) || [])[0] || "";
  }
  if (!out.phone){
    out.phone = (bodyText.match(phoneRx) || [])[0] || "";
  }
  if (!out.name){
    // naive name guess: something like "Customer: John Smith"
    const m = bodyText.match(/customer:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    out.name = m?.[1] || "";
  }

  // Cleanups
  out.phone = out.phone?.replace(/\s+/g, " ").trim();
  return out;
}

/* -------------------- Drafts & NBA -------------------- */
function makeEmail({name, vehicle}){
  const first = name ? name.split(" ")[0] : "there";
  const v = vehicle || "your vehicle";
  return (
`Hi ${first},

Thanks for reaching out to Quirk! I’m the dedicated specialist on your inquiry about ${v}.
Are you available for a quick call today, or would you prefer I text over a few options?

— Quirk Team
(Your Direct Line)`
  );
}

function makeSMS({name, vehicle}){
  const first = name ? name.split(" ")[0] : "";
  const v = vehicle || "the vehicle you asked about";
  return (
`${first ? first + "," : ""} this is Quirk following up on ${v}. Would you like to see availability, pricing, or set an appointment? Reply 1) availability 2) price 3) schedule.`
  );
}

function makeNote({name, email, phone, vehicle, source}){
  return (
`Lead summary:
- Name: ${name || "N/A"}
- Email: ${email || "N/A"}
- Phone: ${phone || "N/A"}
- Vehicle: ${vehicle || "N/A"}
- Source: ${source || "N/A"}

Action: Attempted contact. Left VM / sent email + SMS. Next step in 2 hours if no reply.`
  );
}

function makeNBA(lead){
  // Simple rule-of-thumb NBA; expand as needed
  const steps = [
    "1) Send SMS and email now.",
    "2) If no response in 2 hours, call and leave a concise VM.",
    "3) Offer two appointment windows & one digital option.",
  ];
  return steps.join("\n");
}

/* -------------------- Render -------------------- */
function render(lead){
  const ui = ensurePanel();

  // Key/values
  ui.kvs.innerHTML = "";
  const kv = (k,v) => {
    const row = document.createElement("div");
    row.className = "kv";
    row.innerHTML = `<div class="k">${k}</div><div class="v">${v || "<span style='color:#94a3b8'>N/A</span>"}</div>`;
    ui.kvs.appendChild(row);
  };
  kv("Name", lead.name);
  kv("Email", lead.email);
  kv("Phone", lead.phone);
  kv("Vehicle", lead.vehicle);
  kv("Source", lead.source);

  ui.email.value = makeEmail(lead);
  ui.sms.value   = makeSMS(lead);
  ui.note.value  = makeNote(lead);
  ui.nba.textContent = makeNBA(lead);
}

/* -------------------- Observe & Boot -------------------- */
let lastSig = "";

function signature(o){
  return [o.name,o.email,o.phone,o.vehicle,o.source].join("|");
}

async function tick(){
  const lead = extractLead();
  const sig = signature(lead);
  if (sig !== lastSig){
    lastSig = sig;
    render(lead);
  }
}

function startObservers(){
  const obs = new MutationObserver(() => { tick(); });
  obs.observe(document.documentElement, { childList:true, subtree:true });
}

(async function init(){
  ensurePanel();
  // initial waits help on slow SPAs
  await sleep(400);
  await tick();
  startObservers();
})();

