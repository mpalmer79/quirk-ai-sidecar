// background.js

chrome.runtime.onInstalled.addListener(() => {
  console.log("Quirk Sidecar background ready");
});

// Alt+Q (or your shortcut) -> tell the content script to toggle the panel
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-panel") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "toggle-panel" });
});

// Handle summarize requests from the content script in the background.
// Doing fetch here avoids mixed-content issues on https pages.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "summarize") return;

  fetch("http://127.0.0.1:8765/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: msg.note || "" })
  })
    .then((r) => r.json())
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));

  return true; // keep the message channel open for async sendResponse
});
