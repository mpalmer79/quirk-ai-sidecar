// Send a "toggle" message to the active tab
async function toggleInActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  chrome.tabs.sendMessage(tab.id, { type: "toggle" }, () => {
    // If the content script isn't injected (wrong matches), you'll see this:
    if (chrome.runtime.lastError) {
      console.debug("Sidecar: no receiver on this tab:", chrome.runtime.lastError.message);
    }
  });
}

// Toolbar button click
chrome.action.onClicked.addListener(() => toggleInActiveTab());

// Keyboard shortcut (Alt+Q)
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-sidecar") toggleInActiveTab();
});
// Trigger scrape from keyboard or context-menu
chrome.commands?.onCommand.addListener(cmd => {
  if (cmd === "quirk-scrape-dashboard") {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "quirk:scrape-dashboard" });
      }
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "quirk-scrape-dashboard",
    title: "Quirk: Scrape Dashboard → Local API",
    contexts: ["all"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "quirk-scrape-dashboard" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "quirk:scrape-dashboard" });
  }
});
