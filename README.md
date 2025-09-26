quirk-ai-sidecar/
├─ manifest.json            # MV3 manifest
├─ background.js            # Service worker (hotkeys, messaging)
├─ content.js               # Injected UI & DOM helpers
└─ icons/                   # (optional) 16/32/48/128px icons for Chrome UI

# Quirk AI Sidecar

Helper tools for **VIN Solutions** — delivered as a lightweight Chrome Extension (Manifest v3).  
Runs only on `*.vinsolutions.com` and adds a small, context-aware assistant panel to speed up common CRM tasks.

> **Status:** Preview (v0.1.0) • **Target:** Chrome (MV3) • **Scope:** local UI helpers (read/augment DOM)

---

## ✨ Features (current)

- **Quick panel (Alt + Q)** — toggles the Sidecar overlay on VIN Solutions pages
- **Context awareness** — adjusts shortcuts based on the screen (dashboard, lead detail, etc.)
- **DOM helpers** — copy key fields, jump to tabs/sections, prep canned notes (safe, opt-in)
- **Local-only** — no external API calls; data never leaves your browser

Planned (short list): lightweight templates, deep links, per-store presets, simple validation hints.

---

## 📦 Folder layout

