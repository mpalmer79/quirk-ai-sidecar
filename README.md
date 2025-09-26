Quirk AI Sidecar

Helper tools for VIN Solutions — delivered as a lightweight Chrome Extension (Manifest v3).
Runs only on VIN Solutions pages and shows a small, context-aware assistant panel to speed up common CRM tasks.

Status: Preview (v0.1.x) • Target: Chrome (MV3) • Scope: local UI helpers with an optional local AI endpoint

✨ What it does (today)
One UI everywhere

Quirk orb – a single green “Quirk” button anchored bottom-right that opens/closes the panel.

No duplicates – content script guarantees one panel/orb at a time.

Auto-minimize – if a page isn’t recognized, the panel shows a friendly tip and minimizes back to the orb after ~20s.

Page detection (router)

The content script detects which VIN page you’re on and switches the panel behavior accordingly:

Dealer Dashboard

Button: Scrape dashboard

Parses the Sales Funnel and Key Performance Indicators tiles and prints a clean block like:

Vinconnect — Vinconnect
Customers: 41
Leads:
  Contacted: 26
  Appts Set: 9
  Shown: 2
  Sold: 2
KPIs:
  Unanswered: 7
  Open visits: 3
  Buying signals: 16
  Pending deals: 0
URL: https://…


VIN Text (popup messaging)

Button: Suggest edits

Reads the visible conversation and builds a prompt.

If a local API is available (see Local AI endpoint below), it POSTs and displays the suggestion.

If not available, it still shows the prompt so you can copy/paste.

Browse Inventory

Button: Apply filter

Adds a tiny search box in the panel. We first try VIN’s own Search input; if not present, we apply a client-side row filter to the visible table (tokens must all match, e.g., new tahoe or awd lt).

Clear resets the table visibility.

Desking (Deal Manager) – non-intrusive for now

Button: Tools

Stubs for: quick payment copy, “sanity check” notes (doc fee/rate/term guardrails), etc.

Designed to avoid interfering with desking—purely helper/read-only for now.

Customer page

Button: Copy summary

Copies a minimal name/phone/email block if visible.

Leads list

Button: Copy lead table

Copies the visible table text for quick share/paste.

The router listens to SPA navigation (pushState/replaceState) and DOM mutations, so the panel updates as you move around the CRM.

🧠 Local AI endpoint (optional)

The extension can call a local HTTP service for text suggestions (no external calls by the extension).

Default: http://127.0.0.1:8765

Endpoint: POST /summarize

Body: we send { "note": "<prompt>" }.
The server may also accept { "payload": { ... } } and unwrap it; the extension works with either.

Response: any JSON with a summary, result, or text field is rendered (fallback: raw JSON string).

If the endpoint isn’t running, you’ll see:

Could not reach local API: Failed to fetch


…and we’ll still show the generated prompt for easy copy/paste.

This keeps the extension privacy-friendly: no data leaves your machine unless you run your own service.

🔒 Privacy / Security

Runs only on VIN Solutions hosts (configured in manifest.json).

Reads the DOM you can already see; doesn’t send data anywhere by default.

Optional local endpoint is 127.0.0.1 only.

⌨️ Shortcuts

If you enable the service worker hotkey:

Alt + Q – toggle the panel (can be remapped in chrome://extensions/shortcuts).

🧩 Install from source

Clone or download the repo (make sure the icons/ directory is present).

Visit chrome://extensions → enable Developer mode.

Load unpacked → choose the repo folder.

Navigate to a VIN Solutions page. Click the green Quirk orb.

🧭 Tips & troubleshooting

Panel sticks on a page you left
We debounce navigation; if something looks stale, click the orb to minimize then click again to reopen.

Two panels at once
The script cleans duplicates automatically; reloading the tab also clears them.

“Failed to fetch”
Your local service isn’t running or port 8765 is blocked. The panel will still show the prompt you can paste.

Numbers look off on Dashboard
Tiles move DOM around. Scroll Sales Funnel & KPI tiles into view and click Scrape dashboard again.

🛠️ Tech notes

Manifest v3; single content script with a small router; optional service worker for hotkeys.

Single-panel architecture: one orb, one panel; we clean duplicates on SPA transitions.

Minimal CSS (scoped to the panel via IDs so we don’t fight site styles).

No framework required.

📦 Folder layout
quirk-ai-sidecar/
├─ manifest.json            # MV3 manifest & host permissions
├─ background.js            # (optional) service worker
├─ content.js               # Panel/router/scrapers (single source of truth)
└─ icons/
   ├─ 16.png
   ├─ 32.png
   ├─ 48.png
   └─ 128.png

🗺️ Branch map

Use whatever naming matches your GitHub; this is the suggested map reflecting the current work.

main
├─ feature/page-router-and-orb            # Single-orb UI, minimize-on-unknown, duplicate guard
├─ feature/dashboard-scraper              # Sales Funnel + KPI parsers (Customers/Contacted/Appts/Sold/Unanswered/Open Visits/Buying Signals/Pending)
├─ feature/vintext-suggest-edits          # Conversation reader + local API POST /summarize
├─ feature/inventory-assistant            # Panel quick filter → VIN search or client-side row filter
├─ feature/desking-stub                   # Non-intrusive helpers, payment copy, sanity-check notes
├─ feature/customer-and-leads-helpers     # Copy customer summary, copy leads table
└─ hotfix/minimize-router                 # Auto-minimize after ~20s on unknown pages; SPA nav fixes

📜 Changelog (recent)

v0.1.x

Added single-orb panel, duplicate cleanup, auto-minimize on unknown pages

Router with detectors for Dashboard, VIN Text popup, Inventory, Desking, Customer, Leads

Dashboard scraping (robust label→number mapping; includes Customers)

Inventory helper (VIN search first; fallback row filter)

VIN Text Suggest edits with optional local POST /summarize

Minor UI polish; icons restored from /icons
