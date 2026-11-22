/**
 * The side panel: the same Envoy chat as the web app (@envoy/app), sized for a panel.
 * - Text selected on a page (right-click, Ask Envoy about this selection) arrives as the document.
 * - Your rules live in chrome.storage.local, shared with the in-page widget.
 * - Release builds don't call the cloud from the extension: an approved cloud question continues in
 *   Envoy on the web, where App Check attests the page. extensiondev builds call it directly.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChatApp, useEnvoy, type EnvoyConfig, type RulesStore, type SessionDoc } from '@envoy/app';
import type { CustomRule } from '@envoy/core';
import { CLOUD_ENABLED, HOSTED_APP_URL, cloudModelOverride, readFirebaseEnv } from './env';
import { RULES_KEY } from './rules/rules-store';

const CONFIG: EnvoyConfig = {
  readEnv: readFirebaseEnv,
  cloudModelOverride,
  dev: import.meta.env.MODE === 'extensiondev',
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

export function App() {
  const runtime = useEnvoy(CONFIG);
  const incomingDoc = useSelectedText();
  const cloudHandoff = useMemo(() => (CLOUD_ENABLED ? null : { url: `${HOSTED_APP_URL}/app` }), []);
  return (
    <ChatApp
      runtime={runtime}
      incomingDoc={incomingDoc}
      rulesStore={rulesStore}
      cloudHandoff={cloudHandoff}
      layout="panel"
    />
  );
}
