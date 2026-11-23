/**
 * The side panel: the same Envoy chat as the web app (@envoy/app), sized for a panel.
 * - Text selected on a page (right-click, Ask Envoy about this selection) arrives as the document.
 * - Your rules live in chrome.storage.local, shared with the in-page widget.
 * - Release builds embed the hosted Envoy chat (cloud answers through real App Check, no debug token);
 *   developer builds run the chat here and call the cloud with a local debug token. Offline, the panel
 *   falls back to the on-device chat with a handoff for cloud questions.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatApp, useEnvoy, type EnvoyConfig, type RulesStore, type SessionDoc } from '@envoy/app';
import type { CustomRule } from '@envoy/core';
import { CLOUD_ENABLED, HOSTED_APP_URL, cloudModelOverride, readFirebaseEnv } from './env';
import { RULES_KEY } from './rules/rules-store';

const CONFIG: EnvoyConfig = {
  readEnv: readFirebaseEnv,
  cloudModelOverride,
  dev: import.meta.env.MODE === 'extensiondev',
  // Extension pages may not load the reCAPTCHA script (Manifest V3).
  appCheck: 'no-script',
};

const rulesStore: RulesStore = {
  async load() {
    try {
      const v = await chrome.storage.local.get(RULES_KEY);
      const list = v[RULES_KEY];
      return Array.isArray(list) ? (list as CustomRule[]) : [];
    } catch {
      return [];
    }
  },
  async save(rules) {
    await chrome.storage.local.set({ [RULES_KEY]: rules });
  },
};

/** Text the user sent from a page with the context menu, handed over once through session storage. */
function useSelectedText(): SessionDoc | null {
  const [doc, setDoc] = useState<SessionDoc | null>(null);
  useEffect(() => {
    const take = async () => {
      try {
        const v = await chrome.storage.session.get('envoyPendingSelection');
        const text =
          typeof v.envoyPendingSelection === 'string' ? v.envoyPendingSelection.trim() : '';
        if (!text) return;
        await chrome.storage.session.remove('envoyPendingSelection');
        setDoc({
          title: `Selected text (${text.length.toLocaleString()} characters)`,
          text,
          source: 'paste',
        });
      } catch {
        /* no session storage (tests, old Chrome): nothing to take */
      }
    };
    void take();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'session' && 'envoyPendingSelection' in changes) void take();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);
  return doc;
}

const HOSTED_ORIGIN = new URL(HOSTED_APP_URL).origin;
const CHROME_PAGES = {
  'settings-ai': 'chrome://settings/ai',
  'flags-gemma4': 'chrome://flags/#gemma4-for-built-in-ai',
  internals: 'chrome://on-device-internals',
} as const;
const READY_TIMEOUT_MS = 8000;

/**
 * Release builds: the real Envoy web chat, embedded. It runs on the web origin, where App Check
 * (reCAPTCHA Enterprise) attests it, so the panel gets cloud answers with no debug token. The frame
 * gets Chrome's on-device model through allow="language-model". Selected text and your rules go to
 * the frame by postMessage, on this device. If the page can't load (offline), the panel falls back
 * to the on-device chat with a handoff for cloud questions.
 */
function EmbeddedChat({
  doc,
  onUnavailable,
}: {
  doc: SessionDoc | null;
  onUnavailable: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!ready) onUnavailable();
    }, READY_TIMEOUT_MS);
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== HOSTED_ORIGIN || e.source !== frame.current?.contentWindow) return;
      const m = e.data as { type?: string; rules?: unknown; page?: unknown };
      if (m?.type === 'envoy:ready') {
        setReady(true);
        const rules = await rulesStore.load();
        frame.current?.contentWindow?.postMessage({ type: 'envoy:rules', rules }, HOSTED_ORIGIN);
      } else if (m?.type === 'envoy:save-rules' && Array.isArray(m.rules)) {
        await rulesStore.save(m.rules as CustomRule[]);
      } else if (m?.type === 'envoy:open-chrome-page' && typeof m.page === 'string') {
        // Only these three pages: the private-mode guide's links. Web pages can't open chrome:// pages.
        const url = CHROME_PAGES[m.page as keyof typeof CHROME_PAGES];
        if (url) void chrome.tabs.create({ url });
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
  }, [ready, onUnavailable]);

  useEffect(() => {
    if (ready && doc)
      frame.current?.contentWindow?.postMessage(
        { type: 'envoy:doc', title: doc.title, text: doc.text },
        HOSTED_ORIGIN,
      );
  }, [ready, doc]);

  return (
    <iframe
      ref={frame}
      title="Envoy"
      src={`${HOSTED_APP_URL}/app?embed=extension`}
      allow="language-model"
      className="block h-screen w-full border-0 bg-paper"
    />
  );
}

/** The on-device chat in the panel itself: developer builds (cloud via a local debug token) and the offline fallback. */
function LocalChat({ doc }: { doc: SessionDoc | null }) {
  const runtime = useEnvoy(CONFIG);
  const cloudHandoff = useMemo(() => (CLOUD_ENABLED ? null : { url: `${HOSTED_APP_URL}/app` }), []);
  return (
    <ChatApp
      runtime={runtime}
      incomingDoc={doc}
      rulesStore={rulesStore}
      cloudHandoff={cloudHandoff}
      layout="panel"
    />
  );
}

export function App() {
  const doc = useSelectedText();
  const [embedFailed, setEmbedFailed] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  );
  const fail = useCallback(() => setEmbedFailed(true), []);
  if (CLOUD_ENABLED || embedFailed) return <LocalChat doc={doc} />;
  return <EmbeddedChat doc={doc} onUnavailable={fail} />;
}
