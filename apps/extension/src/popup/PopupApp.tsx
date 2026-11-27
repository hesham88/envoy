import { useEffect, useState } from 'react';
import { getDeviceStatus, type DeviceStatus } from '@envoy/ai';
import { EnvoySeal, Logo, StatusPill, UvRing } from '@envoy/ui';
import { gateState } from '../gate';

/** The AI chat and code sites "Protect AI chats" turns Envoy on for. */
export const AI_CHAT_ORIGINS = [
  'https://chatgpt.com',
  'https://claude.ai',
  'https://gemini.google.com',
  'https://github.com',
];

export function PopupApp() {
  const [origin, setOrigin] = useState('');
  const [host, setHost] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<DeviceStatus | 'checking'>('checking');
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<{ id?: number; windowId?: number }>({});
  const [onboard, setOnboard] = useState<number | null>(null);

  useEffect(() => {
    chrome.storage.local
      .get('envoyOnboarded')
      .then((v) => setOnboard(v.envoyOnboarded ? -1 : 0))
      .catch(() => setOnboard(-1));
    void getDeviceStatus().then(setStatus);
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(async ([t]) => {
        setTab(t ?? {});
        if (!t?.url) return;
        const u = new URL(t.url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
        setOrigin(u.origin);
        setHost(u.host);
        const v = await chrome.storage.local.get('envoySites');
        const sites = (v.envoySites ?? {}) as Record<string, boolean>;
        setEnabled(!!sites[u.origin]);
      })
      .catch(() => undefined);
  }, []);

  async function finishOnboarding() {
    setOnboard(-1);
    await chrome.storage.local.set({ envoyOnboarded: true }).catch(() => undefined);
  }

  /** One permission prompt for the four AI chat sites, then the same per-site switch as below. */
  async function protectAiChats() {
    const granted = await new Promise<boolean>((resolve) =>
      chrome.permissions.request({ origins: AI_CHAT_ORIGINS.map((o) => `${o}/*`) }, (g) =>
        resolve(!!g),
      ),
    );
    if (!granted) {
      setNote('Chrome did not grant access to those sites.');
      return;
    }
    const results = await Promise.all(
      AI_CHAT_ORIGINS.map(
        (o) =>
          chrome.runtime.sendMessage({
            type: 'envoy:set-site',
            origin: o,
            enabled: true,
          }) as Promise<{ ok: boolean } | undefined>,
      ),
    );
    const on = results.filter((r) => r?.ok).length;
    if (AI_CHAT_ORIGINS.includes(origin) && on) setEnabled(true);
    setNote(
      `Envoy is on for ${on} of ${AI_CHAT_ORIGINS.length} AI chat sites. Reload an open chat tab to see it.`,
    );
  }

  async function toggle(next: boolean) {
    if (!origin) return;
    if (next) {
      // Must be requested here, inside the click: a service worker has no user gesture.
      const granted = await new Promise<boolean>((resolve) =>
        chrome.permissions.request({ origins: [`${origin}/*`] }, (g) => resolve(!!g)),
      );
      if (!granted) {
        setNote('Chrome did not grant access to this site.');
        return;
      }
    }
    const res = (await chrome.runtime.sendMessage({
      type: 'envoy:set-site',
      origin,
      enabled: next,
    })) as { ok: boolean; error?: string } | undefined;
    if (res?.ok) {
      setEnabled(next);
      let live = false;
      if (next && tab.id !== undefined) {
        // Start Envoy in this tab now, unless it's already there (registered scripts start on the next load).
        try {
          const [check] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => !!document.getElementById('envoy-field-ui'),
          });
          if (!check?.result)
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js'],
            });
          live = true;
        } catch {
          live = false;
        }
      }
      setNote(
        next
          ? live
            ? 'Envoy is on for this site. Click into a text box to see it.'
            : 'Envoy is on for this site. Reload the tab to see it.'
          : 'Envoy is off for this site. Reload the tab to remove it.',
      );
    } else {
      setNote(res?.error ?? 'Chrome did not grant access to this site.');
    }
  }

  return (
    <div className="w-[320px] bg-paper p-4 font-sans text-ink">
      <header className="mb-3 flex items-center justify-between">
        <Logo size={20} withWordmark />
        <StatusPill status={status} progress={null} compact />
      </header>

      {onboard !== null && onboard >= 0 && (
        <section
          className="mb-3 rounded-card border border-line bg-surface p-3"
          aria-label="Welcome to Envoy"
        >
          {onboard === 0 && (
            <div className="grid justify-items-center gap-2 text-center">
              <EnvoySeal size={110} interactive={false} />
              <h2 className="text-sm font-semibold">What Envoy does</h2>
              <p className="text-xs text-muted">
                Envoy reads your text on this device first, replaces private details with tags like
                [EMAIL], and only ever sends what you approve.
              </p>
            </div>
          )}
          {onboard === 1 && (
            <div>
              <h2 className="text-sm font-semibold">You choose each site</h2>
              <p className="mt-1 text-xs text-muted">
                Envoy does nothing on a site until you switch it on below. When off, it injects
                nothing and changes nothing. Password, one-time-code and card fields are always left
                alone.
              </p>
            </div>
          )}
          {onboard === 2 && (
            <div>
              <h2 className="text-sm font-semibold">Your on-device model</h2>
              <p className="mt-1 text-xs text-muted">
                Right now: {gateState(status).pill}. Without the model, Basic protection uses
                built-in local rules: still masked, still safe, just less clever. You can download
                the model from the side panel.
              </p>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            {onboard < 2 ? (
              <button
                type="button"
                className="min-h-11 flex-1 rounded-control bg-device px-3 py-2 text-sm font-semibold text-uv-deep shadow-[0_0_24px_-8px_var(--device)]"
                onClick={() => setOnboard(onboard + 1)}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="min-h-11 flex-1 rounded-control bg-device px-3 py-2 text-sm font-semibold text-uv-deep shadow-[0_0_24px_-8px_var(--device)]"
                onClick={() => void finishOnboarding()}
              >
                Done
              </button>
            )}
            <button
              type="button"
              className="min-h-11 rounded-control border border-line bg-surface px-3 py-2 text-sm font-semibold"
              onClick={() => void finishOnboarding()}
            >
              Skip
            </button>
          </div>
        </section>
      )}
      <section className="rounded-card border border-line bg-surface p-3">
        <h2 className="text-sm font-semibold">Envoy on this site</h2>
        <p className="mt-1 text-xs text-muted">{host || 'Open a normal web page to choose.'}</p>
        {/* The same ring the text boxes get: on = fluorescent ring, off = nothing. */}
        <UvRing on={enabled} radius={14} className="mt-3">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Envoy on this site"
            disabled={!origin}
            onClick={() => void toggle(!enabled)}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[14px] border border-line bg-paper px-3 text-left text-sm font-semibold disabled:opacity-50"
          >
            {enabled ? 'On for this site' : 'Off for this site'}
            <span
              aria-hidden="true"
              className={`relative h-5 w-9 rounded-full border transition-colors ${enabled ? 'border-device/60 bg-device/20' : 'border-line bg-surface'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full transition-transform ${enabled ? 'translate-x-4 bg-device shadow-[0_0_8px_var(--device)]' : 'bg-muted'}`}
              />
            </span>
          </button>
        </UvRing>
        <p className="text-xs text-muted">
          When on, Envoy adds a small toggle to text boxes here. When off, it injects nothing and
          changes nothing.
        </p>
        {note && (
          <p className="mt-2 text-xs" role="status">
            {note}
          </p>
        )}
      </section>
      <section className="mt-3 rounded-card border border-line bg-surface p-3">
        <h2 className="text-sm font-semibold">AI chats in one step</h2>
        <p className="mt-1 text-xs text-muted">
          Turn Envoy on for ChatGPT, Claude, Gemini and GitHub. It flags private details you paste
          and holds a message that still has them until you choose.
        </p>
        <button
          type="button"
          className="mt-2 min-h-11 w-full rounded-control border border-line bg-paper px-3 py-2 text-sm font-semibold"
          onClick={() => void protectAiChats()}
        >
          Protect AI chats
        </button>
      </section>
      <button
        type="button"
        className="mt-3 min-h-11 w-full rounded-control bg-device px-3 py-2 text-sm font-semibold text-uv-deep shadow-[0_0_24px_-8px_var(--device)]"
        onClick={() => tab.windowId && void chrome.sidePanel.open({ windowId: tab.windowId })}
      >
        Open Envoy panel
      </button>
      <p className="mt-2 text-xs text-muted">
        Private steps run on this device. Basic protection (local rules) applies when the model is
        unavailable.
      </p>
    </div>
  );
}
