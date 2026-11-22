import { useEffect, useState } from 'react';
import { getDeviceStatus, type DeviceStatus } from '@envoy/ai';
import { EnvoySeal, Logo, StatusPill } from '@envoy/ui';

export function PopupApp() {
  const [origin, setOrigin] = useState('');
  const [host, setHost] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<DeviceStatus | 'checking'>('checking');
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<{ windowId?: number }>({});
  const [onboard, setOnboard] = useState<number | null>(null);

  useEffect(() => {
    chrome.storage.local.get('envoyOnboarded').then((v) => setOnboard(v.envoyOnboarded ? -1 : 0)).catch(() => setOnboard(-1));
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
    const res = (await chrome.runtime.sendMessage({ type: 'envoy:set-site', origin, enabled: next })) as { ok: boolean; error?: string } | undefined;
    if (res?.ok) {
      setEnabled(next);
      setNote(next ? 'Envoy can now appear on this site. Reload the tab to see the toggle.' : 'Envoy is off for this site.');
    } else {
      setNote(res?.error ?? 'Chrome did not grant access to this site.');
    }
  }

  return (
    <div className="w-[320px] bg-paper p-4 font-sans text-ink">
      <header className="mb-3 flex items-center justify-between">
        <Logo size={20} withWordmark />
        <StatusPill status={status} progress={null} />
      </header>

      {onboard !== null && onboard >= 0 && (
        <section className="mb-3 rounded-card border border-line bg-surface p-3" aria-label="Welcome to Envoy">
          {onboard === 0 && (
            <div className="grid justify-items-center gap-2 text-center">
              <EnvoySeal size={110} interactive={false} />
              <h2 className="text-sm font-semibold">What Envoy does</h2>
              <p className="text-xs text-muted">Envoy reads your text on this device first, replaces private details with tags like [EMAIL], and only ever sends what you approve.</p>
            </div>
          )}
          {onboard === 1 && (
            <div>
              <h2 className="text-sm font-semibold">You choose each site</h2>
              <p className="mt-1 text-xs text-muted">Envoy does nothing on a site until you switch it on below. When off, it injects nothing and changes nothing. Password, one-time-code and card fields are always left alone.</p>
            </div>
          )}
          {onboard === 2 && (
            <div>
              <h2 className="text-sm font-semibold">Your on-device model</h2>
              <p className="mt-1 text-xs text-muted">Status now: {status}. Without the model, Basic protection uses built-in local rules: still masked, still safe, just less clever. You can download the model from the side panel.</p>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            {onboard < 2
              ? <button type="button" className="min-h-11 flex-1 rounded-control bg-ink px-3 py-2 text-sm font-semibold text-paper" onClick={() => setOnboard(onboard + 1)}>Next</button>
              : <button type="button" className="min-h-11 flex-1 rounded-control bg-ink px-3 py-2 text-sm font-semibold text-paper" onClick={() => void finishOnboarding()}>Done</button>}
            <button type="button" className="min-h-11 rounded-control border border-line bg-surface px-3 py-2 text-sm font-semibold" onClick={() => void finishOnboarding()}>Skip</button>
          </div>
        </section>
      )}
      <section className="rounded-card border border-line bg-surface p-3">
        <h2 className="text-sm font-semibold">Envoy on this site</h2>
        <p className="mt-1 text-xs text-muted">{host || 'Open a normal web page to choose.'}</p>
        <label className="mt-3 flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
          {enabled ? 'On for this site' : 'Off for this site'}
          <input type="checkbox" checked={enabled} disabled={!origin} onChange={(e) => void toggle(e.target.checked)} aria-label="Envoy on this site" />
        </label>
        <p className="text-xs text-muted">When on, Envoy adds a small toggle to text boxes here. When off, it injects nothing and changes nothing.</p>
        {note && <p className="mt-2 text-xs" role="status">{note}</p>}
      </section>
      <button
        type="button"
        className="mt-3 min-h-11 w-full rounded-control bg-ink px-3 py-2 text-sm font-semibold text-paper"
        onClick={() => tab.windowId && void chrome.sidePanel.open({ windowId: tab.windowId })}
      >
        Open Envoy panel
      </button>
      <p className="mt-2 text-xs text-muted">Private steps run on this device. Basic protection (local rules) applies when the model is unavailable.</p>
    </div>
  );
}
