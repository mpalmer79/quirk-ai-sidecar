// background.js (service worker)
chrome.runtime.onInstalled.addListener(() => {
  // Right-click menu for selected text
  chrome.contextMenus.create({
    id: 'quirk-open',
    title: 'Send to Quirk panel',
    contexts: ['selection'],
  });
});

// Open/Toggle panel when the toolbar icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' });
});

// Context-menu -> send selection into panel
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'quirk-open' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'open-with-selection', text: info.selectionText || '' });
  }
});

// Keyboard shortcut (Alt+Q by default)
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-quirk-panel' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' });
  }
});
