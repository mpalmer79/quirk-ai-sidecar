// content.js
(() => {
  let open = false;
  let panel = null;

  function ensurePanel() {
    if (panel) return panel;

    panel = document.createElement("div");
    panel.style.cssText = `
      position:fixed; top:20px; right:20px; z-index:2147483647;
      width:380px; background:#111; color:#fff; padding:12px;
      border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.4);
      font:14px/1.4 system-ui; display:none;
    `;
    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
        <strong>Quirk Sidecar</strong>
        <button id="q-close" style="background:#444;color:#fff;border:0;padding:4px 8px;border-radius:8px;cursor:pointer">×</button>
      </div>

      <textarea id="q-note" style="width:100%;height:120px;border-radius:8px;border:1px solid #333;background:#222;color:#fff;padding:8px"></textarea>

      <div style="margin-top:8px;display:flex; gap:8px;align-items:center">
        <button id="q-sum" style="background:#0ea5e9;border:0;color:#fff;padding:8px 10px;border-radius:8px;cursor:pointer">
          Summarize
        </button>
        <span id="q-status" style="opacity:.8"></span>
      </div>

      <pre id="q-out" style="margin-top:8px;white-space:pre-wrap;background:#1f2937;padding:8px;border-radius:8px;max-height:200px;overflow:auto"></pre>
    `;
    document.body.appendChild(panel);

    panel.querySelector("#q-close").onclick = () => toggle(false);

    panel.querySelector("#q-sum").onclick = () => {
      const text =
        panel.querySelector("#q-note").value || window.getSelection().toString();
      const status = panel.querySelector("#q-status");
      const out = panel.querySelector("#q-out");

      status.textContent = "Calling /summarize…";

      chrome.runtime.sendMessage({ type: "summarize", note: text }, (resp) => {
        if (!resp?.ok) {
          status.textContent = "Error";
          out.textContent = resp?.error || "Unknown error";
          return;
        }
        status.textContent = "Done";
        out.textContent = resp.data?.summary ?? JSON.stringify(resp.data);
      });
    };

    return panel;
  }

  function toggle(force) {
    open = typeof force === "boolean" ? force : !open;
    const p = ensurePanel();
    p.style.display = open ? "block" : "none";
    if (open) {
      // Pre-fill with current selection if there is one
      const sel = window.getSelection()?.toString?.() || "";
      p.querySelector("#q-note").value = sel;
    }
  }

  // Receive Alt+Q command from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "toggle-panel") toggle();
  });

  console.log("Quirk Sidecar content loaded");
})();
