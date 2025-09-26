// Quirk AI Sidecar – background

console.log("Quirk Sidecar service worker alive");

// Toolbar button (if action exists)
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "quirk:toggle" });
    } catch (err) {
      console.warn("No content script on this page yet:", err?.message);
    }
  });
}

// Keyboard shortcut Alt+Q (manifest commands)
if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === "trigger-quirk") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "quirk:toggle" });
      } catch (err) {
        console.warn("No content script on this page yet:", err?.message);
      }
    }
  });
}

// Optional: accept logs from the page
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "quirk:log") {
    console.log("[from content]", msg.data);
    if (typeof sendResponse === "function") sendResponse({ ok: true });
  }
});
