/* global chrome */
// Envoy extension service worker (MV3). No DOM scraping: text arrives only
// from an explicit user action (toolbar click, or a context-menu selection).
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.contextMenus.create({
    id: 'envoy-ask-selection',
    title: 'Ask Envoy about this selection',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'envoy-ask-selection' || !tab?.windowId) return;
  // Session storage only: cleared when the browser closes, never synced or persisted to disk by Envoy.
  await chrome.storage.session.set({ envoyPendingSelection: info.selectionText ?? '' });
  await chrome.sidePanel.open({ windowId: tab.windowId });
});
