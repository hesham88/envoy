import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const ROWS: [string, string, string][] = [
  ['1 · Detect', 'ONLY_ON_DEVICE', 'Local rules only; names flagged for you to check'],
  ['2 · Minimize', 'ONLY_ON_DEVICE', 'Every clause included, masked; you choose'],
  ['3 · Route', 'ONLY_ON_DEVICE', 'Goes to the masked reasoning step'],
  ['4 · You approve', 'No model', 'Always you'],
  ['5 · Reason', 'PREFER_IN_CLOUD', 'Offline: a lighter answer on this device'],
  ['6 · Restore', 'Plain code', 'Always on this device'],
];

/** What the Firebase stack is doing in this browser right now. */
export interface FirebaseStack {
  deviceStatus: string;
  appCheck: 'recaptcha' | 'no-script' | 'none';
  remoteConfigAt: number | null;
  fastCloudModel: string;
  cloudModel: string;
  cloudDefault: 'fast' | 'capable';
  promptVersion: string;
}

function StackTable({ stack }: { stack: FirebaseStack }) {
  const rows: [string, string, string][] = [
    [
      'Firebase AI Logic',
      'Hybrid inference: ONLY_ON_DEVICE for every private step, PREFER_IN_CLOUD only for the reasoning, over tags.',
      `On-device model: ${stack.deviceStatus}`,
    ],
    [
      'App Check',
      'reCAPTCHA Enterprise, limited-use tokens on every cloud call; enforced, so only this app can reach Gemini.',
      stack.appCheck === 'recaptcha'
        ? 'On in this browser'
        : stack.appCheck === 'no-script'
          ? 'Extension pages: token from the extension'
          : 'Off (no Firebase config here)',
    ],
    [
      'Remote Config',
      'Chooses the cloud models and the on-device prompt version without a redeploy.',
      stack.remoteConfigAt
        ? `Fast: ${stack.fastCloudModel}; careful: ${stack.cloudModel}; default ${stack.cloudDefault}; prompts ${stack.promptVersion} (fetched ${new Date(stack.remoteConfigAt).toLocaleTimeString()})`
        : 'Using built-in defaults (not fetched yet)',
    ],
    [
      'Hosting',
      'Serves the app with a strict Content-Security-Policy: the only hosts it can reach are Firebase and reCAPTCHA.',
      'This page',
    ],
    [
      'Not used, on purpose: Auth, Firestore',
      'No accounts and no cloud database: nothing you open is stored on a server. History stays encrypted in this browser.',
      'Zero accounts',
    ],
  ];
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="mb-2 text-left font-semibold">The Firebase stack, on purpose</caption>
      <thead>
        <tr className="border-b border-line text-left">
          <th className="py-2 pr-3">Product</th>
          <th className="py-2 pr-3">What it does in Envoy</th>
          <th className="py-2">Right now</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, what, now]) => (
          <tr key={name} className="border-b border-line align-top last:border-b-0">
            <td className="py-2 pr-3 font-semibold">{name}</td>
            <td className="py-2 pr-3 text-muted">{what}</td>
            <td className="py-2 font-mono text-[12.5px]">{now}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AboutDialog({
  open,
  onClose,
  stack,
}: {
  open: boolean;
  onClose: () => void;
  stack?: FirebaseStack;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink/40 p-6"
      onClick={onClose}
    >
      <dialog
        open
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="relative m-0 flex max-w-[760px] flex-col gap-4 rounded-card border border-line bg-surface p-7 text-ink"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="m-0 text-2xl font-bold">
            How Envoy works
          </h2>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="flex size-11 flex-none items-center justify-center rounded-control border border-line"
          >
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <p className="m-0 leading-relaxed text-muted">
          Envoy practises <strong className="text-ink">Privacy-Conscious Delegation</strong>: a
          small model on your computer reads your document and question first, decides what the
          cloud needs to know, hides identities behind meaning-preserving tags, and asks you before
          anything leaves. A powerful cloud model reasons over that masked excerpt, and your real
          details are put back on your device.
        </p>
        <table className="w-full border-collapse text-sm">
          <caption className="mb-2 text-left font-semibold">
            Firebase AI Logic inference mode per step
          </caption>
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-3">Step</th>
              <th className="py-2 pr-3">Mode</th>
              <th className="py-2">Without the on-device model</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([step, mode, fallback]) => (
              <tr key={step} className="border-b border-line last:border-b-0">
                <td className="py-2 pr-3">{step}</td>
                <td className="py-2 pr-3 font-mono text-[13px]">{mode}</td>
                <td className="py-2 text-muted">{fallback}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {stack && <StackTable stack={stack} />}
        <p className="m-0 text-sm leading-relaxed text-muted">
          <strong className="text-ink">Every private step is checked twice.</strong> An open SDK
          report (firebase-js-sdk #10635) describes "on-device only" requests reaching the cloud in
          browsers without Chrome's built-in model. We haven't seen it ourselves, but Envoy doesn't
          rely on any one layer: it checks the model before every private step, blocks the cloud
          endpoint while one runs, and discards any answer that didn't come from the device.
        </p>
        <p className="m-0 text-sm text-muted">
          Inspired by PAPILLON (Li et al., NAACL 2025),{' '}
          <a
            href="https://arxiv.org/abs/2410.17127"
            target="_blank"
            rel="noreferrer"
            className="text-cloud-on-tint underline"
          >
            "Privacy-Conscious Delegation"
          </a>
          . Envoy is open source under the Apache-2.0 licence:{' '}
          <a
            href="https://github.com/hesham88/envoy"
            target="_blank"
            rel="noreferrer"
            className="text-cloud-on-tint underline"
          >
            github.com/hesham88/envoy
          </a>
          . It explains documents; it doesn't give legal advice.
        </p>
      </dialog>
    </div>
  );
}
