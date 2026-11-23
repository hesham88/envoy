/**
 * Envoy inside the Chrome extension's side panel (/app?embed=extension).
 *
 * The extension's side panel shows this page in a frame, so the chat runs on the web origin, where
 * Firebase App Check (reCAPTCHA Enterprise) can attest it. That way the panel gets cloud answers
 * without shipping any App Check debug token. The site's CSP (frame-ancestors) lets only Envoy's own
 * extension frame it.
 *
 * The panel and this page talk with postMessage, on the device only:
 *   frame -> panel   { type: 'envoy:ready' } and { type: 'envoy:save-rules', rules }
 *   panel -> frame   { type: 'envoy:doc', title, text } and { type: 'envoy:rules', rules }
 * Messages are accepted only from the parent window, and only when it is Envoy's extension.
 */
import { useEffect, useMemo, useState } from 'react';
import { validateCustomRule, type CustomRule } from '@envoy/core';
import type { ChromePage, RulesStore, SessionDoc } from '@envoy/app';

/** Fixed by the public key in apps/extension/public/manifest.json. */
export const ENVOY_EXTENSION_ID = 'ekmjefnebmjbeahkadaheapbgpgkabkd';
export const EXTENSION_ORIGIN = `chrome-extension://${ENVOY_EXTENSION_ID}`;
const MAX_DOC_CHARS = 200_000;

export function isExtensionEmbed(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.parent !== window &&
    new URLSearchParams(location.search).get('embed') === 'extension'
  );
}

function cleanRules(value: unknown): CustomRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (r): r is CustomRule =>
        typeof r === 'object' && r !== null && typeof (r as CustomRule).label === 'string',
    )
    .map((r) => ({
      label: r.label,
      ...(Array.isArray(r.terms) ? { terms: r.terms.filter((t) => typeof t === 'string') } : {}),
      ...(typeof r.pattern === 'string' ? { pattern: r.pattern } : {}),
    }))
    .filter((r) => !validateCustomRule(r));
}

/** The bridge: the document and rules handed in by the panel, and a rules store that writes back. */
export function useExtensionBridge(origin = EXTENSION_ORIGIN): {
  doc: SessionDoc | null;
  rulesStore: RulesStore;
  openChromePage: (page: ChromePage) => void;
} {
  const [doc, setDoc] = useState<SessionDoc | null>(null);
  const [rules, setRules] = useState<{ list: CustomRule[]; at: number } | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || e.origin !== origin) return;
      const m = e.data as { type?: string; title?: unknown; text?: unknown; rules?: unknown };
      if (m?.type === 'envoy:doc' && typeof m.text === 'string' && m.text.trim()) {
        const text = m.text.slice(0, MAX_DOC_CHARS);
        const title =
          typeof m.title === 'string' && m.title ? m.title.slice(0, 120) : 'Selected text';
        setDoc({ title, text, source: 'paste' });
      } else if (m?.type === 'envoy:rules') {
        setRules({ list: cleanRules(m.rules), at: Date.now() });
      }
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'envoy:ready' }, origin);
    return () => window.removeEventListener('message', onMessage);
  }, [origin]);

  // A new store object when the panel's rules arrive, so the chat reloads them.
  const rulesStore = useMemo<RulesStore>(
    () => ({
      load: async () => rules?.list ?? [],
      save: async (list) =>
        window.parent.postMessage({ type: 'envoy:save-rules', rules: list }, origin),
    }),
    [rules, origin],
  );
  const openChromePage = (page: ChromePage) =>
    window.parent.postMessage({ type: 'envoy:open-chrome-page', page }, origin);
  return { doc, rulesStore, openChromePage };
}
