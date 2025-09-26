// content.js
(() => {
  // Prevent double injection if Chrome re-runs the script
  if (window.__quirkSidecarContentLoaded) return;
  window.__quirkSidecarContentLoaded = true;

  const LOG = "[Quirk Sidecar]";
  console.log(`${LOG} content script loaded:`, location.href);

  // ---------- tiny style helper ----------
  const style = (el, obj) => (Object.assign(el.style, obj), el);

  // ---------- panel builders ----------
  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = "quirk-sidecar";

    style(panel, {
      position: "fixed",
      top: "0",
      right: "0",
      width: "360px",
      height: "100vh",
      background: "#ffffff",
      borderLeft: "1px solid #e5e7eb",
      boxShadow: "rgba(0,0,0,.18) -8px 0 20px",
      zIndex: "2147483647",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      display: "flex",
      flexDirection: "column"
    });

    const bar = document.createElement("div");
    bar.id = "quirk-sidecar-bar";
    bar.innerHTML = `<strong>Quirk Sidecar</strong>`;
    style(bar, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      padding: "10px 12px",
      background: "#0f766e", // teal-700
      color: "#fff",
      fontWeight: "700",
      letterSpacing: ".2px"
    });

    const close = document.createElement("button");
    close.id = "quirk-sidecar-close";
    close.type = "button";
    close.title = "Close";
    close.textContent = "✕";
    style(close, {
      border: "none",
      background: "transparent",
      color: "#fff",
      fontSize: "18px",
      lineHeight: "1",
      cursor: "pointer",
      padding: "2px 4px"
    });
    close.addEventListener("click", removePanel);
    bar.appendChild(close);

    const body = document.createElement("div");
    body.id = "quirk-sidecar-body";
    style(body, {
      padding: "12px",
      overflow: "auto",
      flex: "1"
    });
    body.innerHTML = `
      <div style="font-size:14px; color:#0f172a; line-height:1.5">
        <p><strong>Welcome!</strong> Use <code>Alt+Q</code> or the toolbar icon to toggle this panel.</p>
        <p style="margin-top:8px; color:#334155">
          This is the injected Sidecar UI. You can wire this up to your FastAPI service at <code>http://127.0.0.1:8765</code>
          when you’re ready.
        </p>
      </div>
    `;

    panel.append(bar, body);
    document.body.appendChild(panel);
    return panel;
  }

  function getPanel() { return document.getElementById("quirk-sidecar"); }
  function ensurePanel() { return getPanel() || buildPanel(); }
  function removePanel() { getPanel()?.remove(); }
  function togglePanel() { getPanel() ? removePanel() : ensurePanel(); }

  // ---------- messaging from background (toolbar + chrome.commands) ----------
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "toggle") togglePanel();
  });

  // ---------- keyboard fallback (in case shortcut isn't bound) ----------
  document.addEventListener(
    "keydown",
    (e) => {
      // Alt+Q (Windows) / Option+Q (Mac). We also allow Meta+Q as a fallback.
      const key = String(e.key || "").toLowerCase();
      const altQ = e.altKey && key === "q";
      const metaQ = e.metaKey && key === "q";
      if (altQ || metaQ) {
        e.preventDefault();
        togglePanel();
      }
    },
    true
  );

  // ---------- expose small debug API so you can test from DevTools ----------
  window.quirkSidecar = {
    open: ensurePanel,
    close: removePanel,
    toggle: togglePanel
  };
})();
