// Quirk AI Sidecar – MV3 service worker

console.log("Quirk Sidecar service worker alive");

// Install/update
chrome.runtime.onInstalled.addListener(() => {
  console.log("Installed/updated");
});

// Toolbar button click (guarded)
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "quirk:toggle" });
    } catch (err) {
      console.warn("No content script on this page yet:", err?.message);
    }
  });
} else {
  console.warn("chrome.action.onClicked not available in this context");
}

// Keyboard shortcut Alt+Q (guarded)
if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === "trigger-quirk") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "quirk:toggle" });
      } catch (err) {
        console.warn("No content script on this page yet:", err?.message);
      }
    }
  });
}

// Optional: accept logs from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "quirk:log") {
    console.log("[from content]", msg.data);
    if (typeof sendResponse === "function") sendResponse({ ok: true });
  }
});
