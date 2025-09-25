chrome.runtime.onInstalled.addListener(() => {
  console.log("Quirk Sidecar installed");
});

// Keyboard shortcut -> inject (if needed) + tell the page to toggle the panel
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "open-quirk-panel") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  // Attempt to inject content.js (no-op if already present or not permitted)
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } catch (e) {
    // Ignore if already injected / host not permitted
    console.debug("Inject attempt:", e?.message || e);
  }

  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_QUIRK_PANEL" });
});
