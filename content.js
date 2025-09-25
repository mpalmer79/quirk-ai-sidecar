// Avoid double-injection if the page reloads or MV3 reinjects.
if (!window.__quirkSidecarInstalled) {
  window.__quirkSidecarInstalled = true;
  console.log("Quirk Sidecar content script on:", location.href);

  const PANEL_HOST_ID = "quirk-sidecar-root";

  function createPanel() {
    // Host container so we can remove everything cleanly
    const host = document.createElement("div");
    host.id = PANEL_HOST_ID;
    host.style.all = "initial"; // minimize inherited styles
    host.style.position = "fixed";
    host.style.zIndex = "2147483647"; // top-most
    host.style.right = "16px";
    host.style.bottom = "16px";
    host.style.width = "360px";
    host.style.maxWidth = "90vw";
    host.style.fontFamily = "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

    // Shadow root to isolate styles from the CRM app
    const shadow = host.attachShadow({ mode: "open" });

    // Panel UI
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <style>
        :host { all: initial; }

        .card {
          box-sizing: border-box;
          background: #fff;
          color: #0f172a;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 10px 24px rgba(0,0,0,.12);
          overflow: hidden;
        }

        .hdr {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          font-weight: 700;
          background: #0b6e37;
          color: #fff;
        }

        .body {
          padding: 12px;
          line-height: 1.35;
          font-size: 14px;
        }

        .close {
          appearance: none;
          border: 0;
          background: transparent;
          color: #fff;
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
        }

        .row + .row { margin-top: 8px; }

        .muted { color: #475569; font-weight: 500; }
        .kbd {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          background:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px; padding:2px 6px;
        }
      </style>

      <div class="card">
        <div class="hdr">
          <div>Quirk AI Sidecar</div>
          <button class="close" title="Close panel" aria-label="Close">×</button>
        </div>
        <div class="body">
          <div class="row">Hello! Your sidecar is active on this page.</div>
          <div class="row muted">Use <span class="kbd">Alt</span>+<span class="kbd">Q</span> to toggle this panel.</div>
        </div>
      </div>
    `;

    // Wire up close
    wrapper.querySelector(".close").addEventListener("click", removePanel);

    shadow.appendChild(wrapper);
    document.documentElement.appendChild(host);
  }

  function panelExists() {
    return document.getElementById(PANEL_HOST_ID) != null;
  }

  function removePanel() {
    const host = document.getElementById(PANEL_HOST_ID);
    if (host && host.parentNode) host.parentNode.removeChild(host);
  }

  function togglePanel() {
    if (panelExists()) {
      removePanel();
    } else {
      createPanel();
    }
  }

  // Listen for the command from background.js
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "TOGGLE_QUIRK_PANEL") {
      togglePanel();
      sendResponse?.({ ok: true });
    }
    // Returning false – we respond synchronously
    return false;
  });
}
