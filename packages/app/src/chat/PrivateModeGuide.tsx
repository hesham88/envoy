/**
 * How to turn on private mode: live checks of what this browser and computer can do, then the steps
 * to turn on Chrome's on-device AI, download the model, and turn on Gemini Nano 4
 * preview built on Gemma 4. Web pages can't open chrome:// pages; inside the extension's side panel
 * `openChromePage` opens them, elsewhere the guide offers to copy the address.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, CircleX, Copy, ExternalLink, X } from 'lucide-react';
import type { EnvoyRuntime } from '../app/useEnvoy';

export type ChromePage = 'settings-ai' | 'flags-gemma4' | 'internals';
export const CHROME_PAGES: Record<ChromePage, string> = {
  'settings-ai': 'chrome://settings/ai',
  'flags-gemma4': 'chrome://flags/#gemma4-for-built-in-ai',
  internals: 'chrome://on-device-internals',
};

type Level = 'ok' | 'warn' | 'fail';
interface CheckRow {
  label: string;
  level: Level;
  detail: string;
}

const STATUS_TEXT: Record<string, [Level, string]> = {
  available: ['ok', "Ready. Private steps run on Chrome's built-in model."],
  downloadable: ['warn', 'Not downloaded yet. Use step 2 below.'],
  downloading: ['warn', 'Downloading. This can take a while the first time.'],
  unavailable: [
    'fail',
    "Chrome says this device can't run it right now. Turn on on-device AI (step 1), then check again.",
  ],
  'no-api': [
    'fail',
    'This browser has no on-device AI. Use desktop Chrome 139 or later, with on-device AI turned on.',
  ],
  checking: ['warn', 'Checking…'],
};

async function readChecks(): Promise<CheckRow[]> {
  const rows: CheckRow[] = [];
  const ua = navigator.userAgent;
  const version = Number(/Chrome\/(\d+)/.exec(ua)?.[1] ?? 0);
  const mobile = /Android|Mobile|iPhone|iPad/.test(ua);
  rows.push({
    label: 'Browser',
    level: !version || mobile ? 'fail' : version >= 139 ? 'ok' : 'fail',
    detail: !version
      ? 'Not Chrome. Private mode needs desktop Chrome.'
      : mobile
        ? 'Mobile Chrome has no on-device AI for web pages yet. Use desktop Chrome.'
        : `Chrome ${version}${version >= 139 ? '' : ' (needs 139 or later)'}`,
  });
  const cores = navigator.hardwareConcurrency ?? 0;
  rows.push({
    label: 'Processor',
    level: cores >= 4 ? 'ok' : 'fail',
    detail: `${cores || 'Unknown'} cores${cores >= 4 ? '' : ' (Chrome needs 4 or more)'}`,
  });
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  rows.push({
    label: 'Memory',
    level: mem === undefined ? 'warn' : mem >= 8 ? 'ok' : 'fail',
    detail:
      mem === undefined
        ? 'Not reported. Chrome needs 16 GB of RAM without a capable GPU.'
        : mem >= 8
          ? 'At least 8 GB reported. Without a capable GPU, Chrome needs 16 GB.'
          : `${mem} GB reported. Chrome needs 16 GB without a capable GPU.`,
  });
  try {
    const { quota } = await navigator.storage.estimate();
    // Chrome gives a site about 60% of the free disk as quota: a rough guide to free space.
    const freeGb = quota ? quota / 0.6 / 1024 ** 3 : 0;
    rows.push({
      label: 'Free disk',
      level: freeGb >= 22 ? 'ok' : freeGb > 0 ? 'fail' : 'warn',
      detail: freeGb
        ? `About ${Math.round(freeGb)} GB${freeGb >= 22 ? '' : ' (Chrome needs 22 GB free on the drive of your Chrome profile)'}`
        : 'Not reported. Chrome needs 22 GB free.',
    });
  } catch {
    rows.push({
      label: 'Free disk',
      level: 'warn',
      detail: 'Not reported. Chrome needs 22 GB free.',
    });
  }
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null;
  rows.push({
    label: 'Graphics',
    level: adapter ? 'ok' : 'warn',
    detail: adapter
      ? 'A GPU is available. Chrome uses it if it has more than 4 GB of video memory.'
      : 'No GPU reported. Chrome can still run the model on the processor with 16 GB of RAM.',
  });
  return rows;
}

function Icon({ level }: { level: Level }) {
  if (level === 'ok') return <Check size={15} className="text-device" aria-label="OK" />;
  if (level === 'warn')
    return <CircleAlert size={15} className="text-detected-line" aria-label="Check" />;
  return <CircleX size={15} className="text-danger" aria-label="Problem" />;
}

function ChromeLink({ page, open }: { page: ChromePage; open?: (p: ChromePage) => void }) {
  const [copied, setCopied] = useState(false);
  const url = CHROME_PAGES[page];
  return open ? (
    <button
      type="button"
      onClick={() => open(page)}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 font-mono text-[12.5px] text-ink hover:border-device/60"
    >
      {url} <ExternalLink size={13} aria-hidden="true" />
    </button>
  ) : (
    <button
      type="button"
      onClick={() =>
        void navigator.clipboard?.writeText(url).then(
          () => setCopied(true),
          () => undefined,
        )
      }
      title="Web pages can't open Chrome's settings pages. Copy the address and paste it into a new tab."
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 font-mono text-[12.5px] text-ink hover:border-device/60"
    >
      {url} <Copy size={13} aria-hidden="true" />
      <span className="font-sans text-muted">{copied ? 'copied' : 'copy'}</span>
    </button>
  );
}

export function PrivateModeGuide({
  runtime,
  openChromePage,
  onClose,
  onShowRecording,
}: {
  runtime: Pick<EnvoyRuntime, 'status' | 'progress' | 'enablePrivateMode' | 'refreshStatus'>;
  openChromePage?: (page: ChromePage) => void;
  onClose: () => void;
  /** Opens the recorded Private-mode run (for computers that can't run the model). */
  onShowRecording?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<CheckRow[] | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
  }, []);
  useEffect(() => {
    void readChecks().then(setRows);
  }, [round]);

  const [level, text] = STATUS_TEXT[runtime.status] ?? STATUS_TEXT.checking!;
  const pct = runtime.progress !== null ? Math.round(runtime.progress * 100) : null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="guide-h"
      className="envoy-uv m-auto w-[min(640px,calc(100vw-32px))] rounded-[20px] border border-line p-0 text-ink backdrop:bg-black/60"
    >
      <div className="flex max-h-[85vh] flex-col gap-5 overflow-auto p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="guide-h" className="m-0 font-display text-[26px] font-[560]">
            Turn on private mode
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <p className="m-0 text-[14px] leading-relaxed text-muted">
          Private mode runs the private steps on Chrome's built-in model, on this computer. Without
          it, Envoy uses Basic protection: local rules that still hide IDs, numbers, emails and
          accounts.
        </p>

        <section aria-labelledby="guide-checks" className="flex flex-col gap-2">
          <h3 id="guide-checks" className="m-0 text-[15px] font-semibold">
            This computer
          </h3>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13.5px]">
            <li className="flex items-start gap-2">
              <Icon level={level} />
              <span>
                <b>On-device model:</b> {text}
                {pct !== null && runtime.status === 'downloading' ? ` ${pct}%` : ''}
              </span>
            </li>
            {(rows ?? []).map((r) => (
              <li key={r.label} className="flex items-start gap-2">
                <Icon level={r.level} />
                <span>
                  <b>{r.label}:</b> {r.detail}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              void runtime.refreshStatus();
              setRound((n) => n + 1);
            }}
            className="self-start text-[13px] text-device-on-tint underline underline-offset-4"
          >
            Check again
          </button>
        </section>

        <ol className="m-0 flex flex-col gap-4 pl-5 text-[14px] leading-relaxed">
          <li>
            <b>Turn on on-device AI in Chrome.</b> Since Chrome 157 it's off by default in new
            profiles, and while it's off Chrome reports the model as unavailable.
            <div className="mt-1.5">
              <ChromeLink page="settings-ai" open={openChromePage} />
            </div>
          </li>
          <li>
            <b>Download the model.</b> Chrome downloads it once, in the background (a few GB).
            <div className="mt-1.5">
              <button
                type="button"
                onClick={runtime.enablePrivateMode}
                disabled={runtime.status === 'available' || runtime.status === 'no-api'}
                className="rounded-full bg-device px-4 py-2 text-[14px] font-semibold text-uv-deep disabled:opacity-40"
              >
                {runtime.status === 'available'
                  ? 'Model ready'
                  : runtime.status === 'downloading'
                    ? `Downloading${pct !== null ? ` ${pct}%` : '…'}`
                    : "Download Chrome's built-in model"}
              </button>
            </div>
          </li>
          <li>
            <b>Use Gemini Nano 4 (recommended).</b> Envoy is built and measured on Chrome's Gemma 4
            model, which Gemini Nano 4 is built on. It is a Chrome developer trial: turn on this
            flag, relaunch Chrome, and download again. On Chrome's default model Envoy still works,
            but its published numbers don't apply. Chrome decides which model a page gets, and
            neither Chrome nor Firebase tells a page which one answered, so Envoy says "Chrome's
            built-in model".
            <div className="mt-1.5">
              <ChromeLink page="flags-gemma4" open={openChromePage} />
            </div>
          </li>
          <li>
            <b>Check it.</b> Chrome's on-device page shows each model and whether it's ready.
            <div className="mt-1.5">
              <ChromeLink page="internals" open={openChromePage} />
            </div>
          </li>
        </ol>
        <p className="m-0 text-[12.5px] text-muted">
          On a computer without a capable GPU, each private step can take 20 seconds or more; times
          vary a lot by device. You can always choose "Don't wait" and continue with Basic
          protection.
        </p>
        {onShowRecording && (
          <p className="m-0 text-[13.5px]">
            Can't run it on this computer?{' '}
            <button
              onClick={onShowRecording}
              className="text-device-on-tint underline underline-offset-4"
            >
              See a recorded Private-mode run
            </button>
            , made with Gemma 4 on a laptop.
          </p>
        )}
      </div>
    </dialog>
  );
}
