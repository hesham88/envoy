/**
 * /studio/sidepanel — the Chrome extension side panel, designed at real width (400 px) for every state,
 * from the shared @envoy/ui components. Reference implementation for the extension lane: copy the layout.
 */
import {
  AnalyzingPanel,
  EnvoySeal,
  Logo,
  ModeChip,
  RestoredText,
  StatusPill,
  TaggedText,
  type DeviceState,
} from '@envoy/ui';
import type { RestoredSpan } from '@envoy/core';

const EXCERPT =
  "Question: Can my landlord raise the rent 20% this year?\n\nClause 7: 7. Rent. The monthly rent is [RENT]. The Landlord may increase the rent once per contract year by no more than 10%, with at least 60 days' written notice to the Tenant.";
const ANSWER =
  'Not by 20%. Your contract caps yearly increases at 10%, so Karim Fathy can raise it to EGP 9,350 at most, with 60 days’ written notice.';
const spans: RestoredSpan[] = [
  {
    start: ANSWER.indexOf('Karim'),
    end: ANSWER.indexOf('Karim') + 11,
    tag: '[LANDLORD]',
    value: 'Karim Fathy',
    computed: false,
  },
  {
    start: ANSWER.indexOf('EGP'),
    end: ANSWER.indexOf('EGP') + 9,
    tag: '{{RENT * 1.10}}',
    value: 'EGP 9,350',
    computed: true,
  },
];

function Panel({
  title,
  status,
  progress = null,
  children,
}: {
  title: string;
  status: DeviceState;
  progress?: number | null;
  children: React.ReactNode;
}) {
  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
        {title}
      </figcaption>
      <div className="flex h-[760px] w-[400px] flex-none flex-col overflow-hidden rounded-[14px] border border-line bg-paper shadow-[0_1px_0_var(--line)]">
        <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
          <Logo withWordmark size={22} />
          <StatusPill status={status} progress={progress} compact />
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-auto p-4">{children}</div>
      </div>
    </figure>
  );
}

const card = 'rounded-card border border-line bg-surface p-4';
const primary = 'min-h-11 w-full rounded-control bg-ink px-4 font-semibold text-paper';
const secondary = 'min-h-11 rounded-control border border-line bg-surface px-4 font-semibold';

export function SidePanelMockup() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="flex items-center justify-between border-b border-line bg-surface px-8 py-5">
        <Logo withWordmark />
        <span className="font-mono text-xs tracking-widest text-muted uppercase">
          Chrome side panel · 400 px · every state
        </span>
      </header>
      <main className="flex gap-8 overflow-x-auto px-8 py-10">
        <Panel title="1 · Empty" status="available">
          <div className="flex flex-col items-center gap-4 pt-6 text-center">
            <EnvoySeal size={200} interactive={false} title="Envoy seal" />
            <h1 className="m-0 text-xl font-bold">Ask the cloud. Keep your secrets.</h1>
            <p className="m-0 text-sm leading-relaxed text-muted">
              Select text on any page, right-click, and choose{' '}
              <strong className="text-ink">Ask Envoy privately</strong>. Or paste a document below.
            </p>
            <button className={secondary}>Paste text</button>
          </div>
        </Panel>

        <Panel title="2 · Start" status="available">
          <div className={card}>
            <p className="m-0 mb-1 text-xs font-semibold tracking-wider text-muted uppercase">
              From the page
            </p>
            <p className="m-0 line-clamp-4 text-sm text-muted">
              7. Rent. The monthly rent is EGP 8,500. The Landlord may increase the rent once per
              contract year by no more than 10%…
            </p>
            <p className="m-0 mt-2 text-xs text-muted-2">412 words · read on this device</p>
          </div>
          <label className="text-sm font-semibold" htmlFor="m-q">
            What do you want to know?
          </label>
          <textarea
            id="m-q"
            rows={2}
            defaultValue="Can my landlord raise the rent 20% this year?"
            className="rounded-control border border-line bg-surface p-3 text-[15px]"
          />
          <div className="flex flex-wrap gap-1.5">
            {['When does my contract end?', 'What about my deposit?'].map((q) => (
              <span
                key={q}
                className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs"
              >
                {q}
              </span>
            ))}
          </div>
          <button className={primary}>Analyze privately</button>
          <div className="flex gap-1.5">
            <ModeChip kind="device">Detect · Minimize · Restore</ModeChip>
          </div>
        </Panel>

        <Panel title="3 · Analyzing" status="available">
          <AnalyzingPanel
            progress={{ step: 'minimize', part: 1, parts: 1 }}
            mode="private"
            startedAt={Date.now() - 23_000}
          />
          <p className="m-0 text-[13px] text-muted">
            You'll see exactly what the cloud would receive before anything is sent.
          </p>
        </Panel>

        <Panel title="4 · Review" status="available">
          <section
            aria-label="What the cloud will see"
            className="flex flex-col gap-3 rounded-card border-2 border-cloud bg-surface p-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="m-0 text-base font-bold">What the cloud will see</h2>
              <ModeChip kind="cloud">Waiting</ModeChip>
            </div>
            <div className="rounded-[10px] bg-paper p-3 font-mono text-[12.5px] leading-[1.7] whitespace-pre-wrap">
              <TaggedText text={EXCERPT} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[10px] bg-cloud-tint/60 p-2.5">
                <div className="text-lg font-bold text-cloud-on-tint">1 clause</div>
                <div className="text-xs text-muted">of 6 pages</div>
              </div>
              <div className="rounded-[10px] bg-device-tint p-2.5">
                <div className="text-lg font-bold text-device-on-tint">0 identities</div>
                <div className="text-xs text-muted">leave the device</div>
              </div>
            </div>
            <p className="m-0 text-xs text-device-on-tint">
              Guard: no raw personal detail in this excerpt.
            </p>
            <div className="flex gap-2">
              <button className={`${primary} flex-1`}>Approve and send</button>
              <button className={secondary}>Edit</button>
            </div>
          </section>
          <p className="m-0 text-xs text-muted-2">
            20 details found on this device · 18 masked · names flagged: none
          </p>
        </Panel>

        <Panel title="5 · Answer" status="available">
          <article className={`${card} flex flex-col gap-3`}>
            <div className="flex flex-wrap gap-1.5">
              <ModeChip kind="cloud">Reasoned in the cloud</ModeChip>
              <ModeChip kind="device">Personalized on device</ModeChip>
            </div>
            <p className="m-0 text-[15px] leading-relaxed">
              <strong className="text-lg">
                <RestoredText text={ANSWER} spans={spans} from={0} to={11} />
              </strong>
              <RestoredText text={ANSWER} spans={spans} from={11} />
            </p>
            <p className="m-0 text-xs text-muted-2">
              Green values were restored on your device. Not legal advice.
            </p>
          </article>
          <div className={`${card} flex flex-col gap-2 text-sm`}>
            <span className="text-xs font-semibold tracking-wider text-cloud-on-tint uppercase">
              Left your device
            </span>
            <span className="font-bold">1 clause · 248 characters</span>
            <span className="text-xs font-semibold tracking-wider text-device-on-tint uppercase">
              Stayed on device
            </span>
            <span className="font-bold">20 personal items · 6 pages</span>
          </div>
        </Panel>

        <Panel title="6 · Basic protection" status="no-api">
          <div className="rounded-card bg-detected/70 p-4 text-sm leading-relaxed">
            <strong>Basic protection.</strong> No on-device model in this browser, so local rules
            hide IDs, phones, emails, IBANs and amounts. Names below are masked; check them before
            you approve.
          </div>
          <div className={card}>
            <p className="m-0 mb-1 text-sm font-semibold">Names to check</p>
            <p className="m-0 text-sm text-muted">Karim Fathy · Mona Adel · Sara Nabil</p>
          </div>
          <div className={card}>
            <p className="m-0 mb-1 text-sm font-semibold">Turn on on-device AI</p>
            <ol className="m-0 list-decimal pl-5 text-sm text-muted">
              <li>Chrome 148+ on desktop</li>
              <li>Settings → AI → On-device AI</li>
              <li>Reopen this panel</li>
            </ol>
          </div>
        </Panel>
      </main>
    </div>
  );
}
