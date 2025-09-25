// content.js
(() => {
  console.log("Quirk Sidecar content script on", location.href);

  let rootEl, shadow, textarea;

  function ensurePanel() {
    if (rootEl) return;

    rootEl = document.createElement('div');
    rootEl.id = 'quirk-root';
    Object.assign(rootEl.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      display: 'none',
      width: '360px',
      height: '260px',
    });
    document.documentElement.appendChild(rootEl);

    shadow = rootEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .card {
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        width: 100%; height: 100%;
        box-shadow: 0 12px 24px rgba(0,0,0,.18);
        display: grid;
        grid-template-rows: 40px 1fr 44px;
        overflow: hidden;
      }
      .hdr {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0 12px; font-weight: 700; color: #0b6e37; border-bottom: 1px solid #eef2f7;
      }
      .hdr button {
        border: 0; background: transparent; font-size: 18px; cursor: pointer;
      }
      textarea {
        width: 100%; height: 100%; border: 0; resize: none; padding: 10px 12px; outline: none;
        font: inherit; color: #0f172a;
      }
      .row {
        display: flex; gap: 8px; padding: 8px; border-top: 1px solid #eef2f7; justify-content: flex-end;
      }
      .btn {
        border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 8px 12px; cursor: pointer; font-weight: 600;
      }
      .btn.primary {
        color: #fff; background: #0b6e37; border-color: #0b6e37;
      }
    `;
    shadow.append(style);

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="hdr">Quirk Sidecar <button id="close" aria-label="Close">×</button></div>
      <textarea id="ta" placeholder="Notes…"></textarea>
      <div class="row">
        <button id="copy" class="btn">Copy</button>
        <button id="hide" class="btn">Hide</button>
        <button id="save" class="btn primary">Save (stub)</button>
      </div>
    `;
    shadow.append(card);

    textarea = card.querySelector('#ta');

    shadow.getElementById = id => shadow.querySelector('#' + id);
    shadow.getElementById('close').addEventListener('click', hide);
    shadow.getElementById('hide').addEventListener('click', hide);
    shadow.getElementById('copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(textarea.value || ''); } catch {}
    });
    shadow.getElementById('save').addEventListener('click', async () => {
      // Placeholder: later we’ll post to Sheets/LLM/your API via the service worker.
      console.log('[Quirk] Save clicked with text:', textarea.value);
    });
  }

  function show(text) {
    ensurePanel();
    if (typeof text === 'string' && text.trim()) textarea.value = text;
    rootEl.style.display = 'block';
    setTimeout(() => textarea?.focus(), 0);
  }

  function hide() {
    if (rootEl) rootEl.style.display = 'none';
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'toggle-panel') {
      if (!rootEl || rootEl.style.display === 'none') show(); else hide();
    }
    if (msg.type === 'open-with-selection') show(msg.text || '');
  });
})();
