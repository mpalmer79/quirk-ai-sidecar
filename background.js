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
