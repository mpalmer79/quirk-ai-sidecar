// content.js
(() => {
  if (window.__quirkSidecarContentLoaded) return;
  window.__quirkSidecarContentLoaded = true;

  const LOG = "[Quirk Sidecar]";
  console.log(`${LOG} content script loaded:`, location.href);

  // ---------------------------
  // Utilities
  // ---------------------------
  const css = (el, obj) => (Object.assign(el.style, obj), el);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function copy(text) {
    navigator.clipboard.writeText(text || "").then(
      () => toast("Copied to clipboard"),
      () => toast("Copy failed")
    );
  }

  function toast(msg, ms = 1400) {
    let t = document.createElement("div");
    t.textContent = msg;
    css(t, {
      position: "fixed",
      bottom: "18px",
      right: "18px",
      background: "#0f766e",
      color: "#fff",
      padding: "8px 12px",
      borderRadius: "10px",
      boxShadow: "0 6px 18px rgba(0,0,0,.25)",
      zIndex: 2147483647,
      fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
      fontSize: "13px"
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  function findNotesField() {
    // look for the most common labels / placeholders
    const candidates = [
      'textarea[placeholder*="note" i]',
      'textarea[placeholder*="comment" i]',
      'textarea[aria-label*="note" i]',
      'textarea[aria-label*="comment" i]',
      "textarea"
    ];
    for (const sel of candidates) {
      const el = $(sel);
      if (el) return el;
    }
    return null;
  }

  function getSelectedText() {
    const s = String(window.getSelection?.().toString() || "");
    return s.trim();
  }

  // quick-and-dirty parse for name/phone/email/vehicle
  function parseContext() {
    const text = document.body.innerText || "";
    const ctx = {
      name: (text.match(/\b([A-Z][a-z]+)\s([A-Z][a-z]+)\b/) || [])[0] || "",
      phone: (text.match(/(\(?\d{3}\)?[\s\-\.]?\d{3}[\s\-\.]?\d{4})/) || [])[0] || "",
      email: (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || "",
      vehicle: (text.match(/\b(20\d{2})\s+([A-Z][a-zA-Z]+)\s+([A-Z][a-zA-Z0-9]+)\b/) || [])[0] || ""
    };
    return ctx;
  }

  // ---------------------------
  // API to local FastAPI
  // ---------------------------
  async function summarizeNote(note) {
    try {
      const r = await fetch("http://127.0.0.1:8765/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note })
      });
      if (!r.ok) throw new Error(`Server ${r.status}`);
      const data = await r.json();
      return data.summary || "";
    } catch (e) {
      console.warn(LOG, "summarize failed", e);
      toast("Summarize failed (check FastAPI)");
      return "";
    }
  }

  // ---------------------------
  // Templates / scripts
  // ---------------------------
  function fill(tpl, ctx) {
    return tpl
      .replace(/\{\{name\}\}/gi, ctx.name || "there")
      .replace(/\{\{vehicle\}\}/gi, ctx.vehicle || "your vehicle")
      .replace(/\{\{dealer\}\}/gi, "Quirk")
      .replace(/\{\{phone\}\}/gi, ctx.phone || "");
  }

  const TEMPLATES = {
    "Text: Appointment Confirm": `Hi {{name}}, this is {{dealer}}. Looking forward to seeing you for {{vehicle}}. If anything changes, just reply here. 👍`,
    "Text: No-Show Follow-up": `Hi {{name}}, we missed you today. Want to pick a better time to look at {{vehicle}}?`,
    "Email: First Touch": `Hi {{name}},\n\nThanks for reaching out about {{vehicle}}. When’s a good time for a quick call? I can also text if easier.\n\n— {{dealer}}`,
  };

  function generateCallScript(ctx) {
    return `CALL OPENING
• "Hi ${ctx.name || "there"}, this is Michael with Quirk."
• "I'm calling about ${ctx.vehicle || "your request"} — did I catch you at a good time?"

DISCOVERY
• "Are you currently driving something you’d like to trade?"
• "What’s most important to you — payment, features, or timeline?"

NEXT STEP
• "I can have ${ctx.vehicle || "the vehicle"} pulled up front. Does today after work or tomorrow morning work better?"
• "I'll text you details at ${ctx.phone || "your number"}."

CLOSE
• "Thanks ${ctx.name || ""}! I’ll send a confirmation."`;
  }

  // ---------------------------
  // Panel UI
  // ---------------------------
  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = "quirk-sidecar";

    css(panel, {
      position: "fixed",
      top: 0,
      right: 0,
      width: "380px",
      height: "100vh",
      background: "#fff",
      borderLeft: "1px solid #e5e7eb",
      boxShadow: "rgba(0,0,0,.18) -8px 0 20px",
      zIndex: 2147483647,
      display: "flex",
      flexDirection: "column",
      fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
    });

    const bar = document.createElement("div");
    bar.innerHTML = `<strong>Quirk Sidecar</strong>`;
    css(bar, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 12px",
      background: "#0f766e",
      color: "#fff",
      fontWeight: 700
    });

    const x = document.createElement("button");
    x.textContent = "✕";
    x.title = "Close";
    x.onclick = () => panel.remove();
    css(x, {
      border: "none",
      background: "transparent",
      color: "#fff",
      fontSize: "18px",
      cursor: "pointer"
    });
    bar.appendChild(x);

    const body = document.createElement("div");
    css(body, { padding: "12px", overflow: "auto", flex: 1 });

    // Context
    const ctxBox = document.createElement("div");
    const ctx = parseContext();
    ctxBox.innerHTML = `
      <div style="font-size:12px; color:#334155">
        <div><b>Name:</b> ${ctx.name || "-"}</div>
        <div><b>Phone:</b> ${ctx.phone || "-"}</div>
        <div><b>Email:</b> ${ctx.email || "-"}</div>
        <div><b>Vehicle:</b> ${ctx.vehicle || "-"}</div>
      </div>
    `;

    // Controls
    const btnRow = document.createElement("div");
    css(btnRow, { display: "flex", gap: "8px", margin: "12px 0" });

    const btnSumm = document.createElement("button");
    btnSumm.textContent = "Summarize";
    const btnCall = document.createElement("button");
    btnCall.textContent = "Call Script";

    const btnStyle = {
      background: "#0f766e",
      color: "#fff",
      border: "none",
      borderRadius: "10px",
      padding: "8px 10px",
      cursor: "pointer",
      fontWeight: 600
    };
    css(btnSumm, btnStyle);
    css(btnCall, btnStyle);

    btnRow.append(btnSumm, btnCall);

    // Templates
    const tplRow = document.createElement("div");
    css(tplRow, { display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", marginBottom: "12px" });

    const tplSel = document.createElement("select");
    Object.keys(TEMPLATES).forEach(k => {
      const o = document.createElement("option");
      o.value = k; o.textContent = k;
      tplSel.appendChild(o);
    });
    css(tplSel, {
      border: "1px solid #cbd5e1",
      borderRadius: "10px",
      padding: "8px"
    });

    const btnInsertTpl = document.createElement("button");
    btnInsertTpl.textContent = "Insert";
    css(btnInsertTpl, btnStyle);
    tplRow.append(tplSel, btnInsertTpl);

    // Output
    const out = document.createElement("textarea");
    out.rows = 12;
    css(out, {
      width: "100%",
      border: "1px solid #cbd5e1",
      borderRadius: "10px",
      padding: "10px",
      fontSize: "13px",
      lineHeight: 1.4
    });

    // Output actions
    const outRow = document.createElement("div");
    css(outRow, { display: "flex", gap: "8px", marginTop: "8px" });

    const btnCopy = document.createElement("button");
    btnCopy.textContent = "Copy";
    const btnInsert = document.createElement("button");
    btnInsert.textContent = "Insert into Notes";
    css(btnCopy, btnStyle);
    css(btnInsert, btnStyle);

    outRow.append(btnCopy, btnInsert);

    // Wire actions
    btnSumm.onclick = async () => {
      const sel = getSelectedText();
      const noteField = findNotesField();
      const src = sel || (noteField?.value || "");
      if (!src.trim()) {
        toast("Select text or type into Notes first");
        return;
      }
      out.value = "Summarizing…";
      const sum = await summarizeNote(src);
      out.value = sum || "(no summary)";
    };

    btnCall.onclick = () => {
      out.value = generateCallScript(parseContext());
      toast("Call script generated");
    };

    btnInsertTpl.onclick = () => {
      const tpl = TEMPLATES[tplSel.value];
      out.value = fill(tpl, parseContext());
      toast("Template ready");
    };

    btnCopy.onclick = () => copy(out.value);
    btnInsert.onclick = () => {
      const noteField = findNotesField();
      if (!noteField) {
        copy(out.value);
        toast("Notes field not found — copied instead");
        return;
      }
      // insert (replace or append)
      const sep = noteField.value.trim() ? "\n\n" : "";
      noteField.value = `${noteField.value}${sep}${out.value}`;
      noteField.dispatchEvent(new Event("input", { bubbles: true }));
      toast("Inserted into notes");
    };

    body.append(ctxBox, btnRow, tplRow, out, outRow);
    panel.append(bar, body);
    document.body.appendChild(panel);
    return panel;
  }

  function getPanel() { return $("#quirk-sidecar"); }
  function ensurePanel() { return getPanel() || buildPanel(); }
  function togglePanel() { getPanel() ? getPanel().remove() : ensurePanel(); }

  // Toolbar / background message
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "toggle") togglePanel();
  });

  // Keyboard fallback (Alt+Q or Meta+Q)
  document.addEventListener("keydown", (e) => {
    const k = String(e.key || "").toLowerCase();
    if ((e.altKey && k === "q") || (e.metaKey && k === "q") || (e.ctrlKey && k === "q")) {
      e.preventDefault();
      togglePanel();
    }
  }, true);

  // Expose for DevTools
  window.quirkSidecar = { toggle: togglePanel, open: ensurePanel };
})();
