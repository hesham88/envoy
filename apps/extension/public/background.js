/* global chrome */
// Envoy extension service worker (MV3). No DOM scraping: page text arrives only
// from an explicit user action (toolbar click, context-menu selection, or the
// per-site Envoy toggle the user switched on in the popup).
const CONTENT_ID = 'envoy-content';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  chrome.contextMenus.create({ id: 'envoy-ask-selection', title: 'Ask Envoy about this selection', contexts: ['selection'] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'envoy-ask-selection' || !tab?.windowId) return;
  await chrome.storage.session.set({ envoyPendingSelection: info.selectionText ?? '' });
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

async function setSiteEnabled(origin, enabled) {
  const stored = await chrome.storage.local.get('envoySites');
  const sites = { ...(stored.envoySites ?? {}), [origin]: enabled };
  await chrome.storage.local.set({ envoySites: sites });
  const match = `${origin}/*`;
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_ID + ':' + origin] }).catch(() => []);
  if (enabled && existing.length === 0) {
    // Host permission is granted by the popup itself (needs the click gesture); here we only register.
    await chrome.scripting.registerContentScripts([
      { id: CONTENT_ID + ':' + origin, js: ['content.js'], matches: [match], runAt: 'document_idle', persistAcrossSessions: true },
    ]);
  }
  if (!enabled && existing.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_ID + ':' + origin] });
  }
  return sites;
}

let offscreenCreating = null;
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }).catch(() => []);
  if (contexts.length > 0) return;
  if (!offscreenCreating) {
    offscreenCreating = chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['WORKERS'], justification: 'Run on-device AI detection with Firebase AI Logic outside the page context.' })
      .finally(() => { offscreenCreating = null; });
  }
  await offscreenCreating;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'envoy:set-site') {
    setSiteEnabled(msg.origin, !!msg.enabled).then((sites) => sendResponse({ ok: true, sites })).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === 'envoy:deep-check') {
    (async () => {
      try {
        await ensureOffscreen();
        const res = await chrome.runtime.sendMessage({ type: 'envoy:deep-detect-internal', text: msg.text });
        sendResponse(res ?? { ok: false, error: 'No response from the on-device checker.' });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
  return false;
});
