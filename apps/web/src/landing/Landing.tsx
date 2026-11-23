/**
 * The public landing page (/): Envoy under the UV lamp. Marketing, judging and the extension download
 * in one page; the product itself lives at /app.
 */
import {
  DelegationScene,
  EnvoySeal,
  Logo,
  SecurityFibers,
  STEP_EMBLEMS,
  StepEmblem,
} from '@envoy/ui';
import { UvDemo } from './UvDemo';

const REPO = 'https://github.com/hesham88/envoy';
const src = (path: string, line?: number) => `${REPO}/blob/main/${path}${line ? `#L${line}` : ''}`;

// The measured results file the eval harness writes. Absent until the eval publishes; the page says so.
const summaries = import.meta.glob<{ default: EvalSummary }>(
  '../../../../tests/eval/summary.json',
  { eager: true },
);
const evalSummary = Object.values(summaries)[0]?.default ?? null;

export interface EvalSummary {
  generatedAt: string;
  arms: {
    id: string;
    label: string;
    model: { label: string; component: string; version: string } | null;
    /** The days its cases were run (YYYY-MM-DD). */
    measuredOn?: string[];
    n: number;
    nTotal: number;
    metrics: Record<string, number | { p50: number; p95: number } | undefined>;
  }[];
}

/** [path, line, the symbol on that line]. `links.test.ts` checks every line still holds its symbol. */
export type CodeRef = [string, number?, string?];

export const STEPS: {
  key: string;
  title: string;
  where: string;
  mode: string;
  body: string;
  code: CodeRef;
}[] = [
  {
    key: 'detect',
    title: 'Find what is private',
    where: 'This device',
    mode: 'ONLY_ON_DEVICE',
    body: 'Rules catch numbers, accounts and keys. The on-device model finds names, roles and amounts the rules cannot know.',
    code: ['packages/ai/src/models.ts', 33, 'modeFor'],
  },
  {
    key: 'minimize',
    title: 'Keep only what the question needs',
    where: 'This device',
    mode: 'ONLY_ON_DEVICE',
    body: 'The on-device model picks the clauses that answer your question. Everything else stays behind.',
    code: ['packages/ai/src/pipeline.ts', 105, 'selectClausesBatched'],
  },
  {
    key: 'approve',
    title: 'You approve the exact text',
    where: 'You',
    mode: 'No model',
    body: 'You see the excerpt word for word, with every detail already a tag. Share a value, hide a sentence, or stop.',
    code: ['packages/app/src/chat/ChatApp.tsx'],
  },
  {
    key: 'reason',
    title: 'The cloud reasons over tags',
    where: 'Cloud',
    mode: 'PREFER_IN_CLOUD',
    body: 'Gemini answers using [RENT] and [LANDLORD], and writes maths like {{RENT * 1.10}} instead of guessing numbers.',
    code: ['packages/ai/src/pipeline.ts', 405, 'buildReasonPrompt'],
  },
  {
    key: 'restore',
    title: 'Real values come back on your device',
    where: 'This device',
    mode: 'No model',
    body: 'Tags turn back into your real details, and the maths is done here, so the cloud never sees the result either.',
    code: ['packages/core/src/restore.ts'],
  },
];

export const GUARD: [string, string, CodeRef][] = [
  [
    'Check before every private step',
    "Chrome's on-device model must report itself available, or Envoy switches to Basic protection.",
    ['packages/ai/src/device-guard.ts', 100, 'getDeviceStatus'],
  ],
  [
    'Fence the network',
    'While a private step runs, any request to the cloud endpoint is blocked and the run stops.',
    ['packages/ai/src/device-guard.ts', 131, 'withCloudTripwire'],
  ],
  [
    'Verify where it ran',
    'After each private step, Envoy checks the response came from the device, not the cloud.',
    ['packages/ai/src/device-guard.ts', 210, 'InferenceSource.ON_DEVICE'],
  ],
  [
    'Check what leaves',
    'Every outgoing excerpt is scanned again for raw values, spaced, punctuated or not. Anything raw blocks the send.',
    ['packages/core/src/guard.ts'],
  ],
];

function Section({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className="mx-auto w-full max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28"
    >
      <h2
        id={`${id}-h`}
        className="m-0 max-w-[22ch] font-display text-[clamp(2rem,1.3rem+2.4vw,3.3rem)] leading-[1.05] font-[560] tracking-[-0.01em] text-uv-text"
      >
        {title}
      </h2>
      {lede && (
        <p className="mt-5 mb-0 max-w-[62ch] text-[18px] leading-relaxed text-uv-muted">{lede}</p>
      )}
      <div className="mt-12">{children}</div>
    </section>
  );
}

function CodeLink({ path, line }: { path: string; line?: number }) {
  return (
    <a
      href={src(path, line)}
      className="font-mono text-[12.5px] text-uv-blue underline decoration-uv-blue/40 underline-offset-4 hover:decoration-uv-blue"
    >
      {path.split('/').slice(-1)[0]}
      {line ? `:${line}` : ''}
    </a>
  );
}

export function Landing() {
  return (
    <div className="envoy-uv min-h-screen font-sans">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded focus:bg-uv-panel focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-uv-line/70 bg-uv-dark/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <a href="/" className="text-uv-text" aria-label="Envoy home">
            <Logo withWordmark />
          </a>
          <nav
            aria-label="Main"
            className="hidden items-center gap-7 text-[15px] text-uv-muted md:flex"
          >
            <a className="hover:text-uv-text" href="#how">
              How it works
            </a>
            <a className="hover:text-uv-text" href="#guard">
              The guard
            </a>
            <a className="hover:text-uv-text" href="#extension">
              Extension
            </a>
            <a className="hover:text-uv-text" href="#judges">
              For judges
            </a>
            <a className="hover:text-uv-text" href={REPO}>
              GitHub
            </a>
          </nav>
          <a
            href="/app"
            className="rounded-full bg-uv-green px-4 py-2 text-[15px] font-semibold text-uv-deep shadow-[0_0_24px_-4px_var(--uv-green)] hover:brightness-110"
          >
            Open Envoy
          </a>
        </div>
      </header>

      <main id="main">
        {/* ---------- hero: the slogan, then the lamp ---------- */}
        <section aria-labelledby="hero-h" className="relative overflow-hidden">
          <div className="absolute inset-0 opacity-90">
            <SecurityFibers guard={0.46} density={0.7} />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[-20%] left-1/2 h-[720px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(123,92,255,0.22),transparent)]"
          />
          <div className="relative mx-auto max-w-[1180px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
            <div className="grid items-end gap-10 lg:grid-cols-[1fr_auto]">
              <div>
                <h1
                  id="hero-h"
                  className="m-0 max-w-[14ch] font-display text-[clamp(3rem,1.6rem+5.4vw,6.4rem)] leading-[0.95] font-[600] tracking-[-0.02em] text-uv-text"
                >
                  Ask the cloud. Keep your secrets.
                </h1>
                <p className="mt-7 mb-0 max-w-[56ch] text-[19px] leading-relaxed text-uv-muted">
                  Envoy is your private agent to cloud AI. AI on your own device decides what the
                  cloud needs to know, swaps your details for tags, and shows you the exact text
                  before anything is sent.
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <a
                    href="/app"
                    className="rounded-full bg-uv-green px-6 py-3 text-[16px] font-semibold text-uv-deep shadow-[0_0_32px_-6px_var(--uv-green)] hover:brightness-110"
                  >
                    Open Envoy
                  </a>
                  <a
                    href="#extension"
                    className="rounded-full border border-uv-line px-6 py-3 text-[16px] font-medium text-uv-text hover:border-uv-blue/70"
                  >
                    Get the Chrome extension
                  </a>
                </div>
              </div>
              <div className="hidden lg:block">
                <EnvoySeal size={230} />
              </div>
            </div>

            <div className="mt-16 rounded-[22px] border border-uv-line bg-uv-dark/70 p-5 backdrop-blur-sm sm:p-7">
              <UvDemo />
              <p className="mt-5 mb-0 border-t border-uv-line/70 pt-4 text-[14px] leading-relaxed text-uv-muted">
                This instant check runs on this page with rules only: no AI, and nothing is sent.
                The full pipeline, with the on-device model and Firebase AI Logic, runs in the app,
                where tags also carry roles, like [LANDLORD] and [RENT], so the cloud can still
                reason about who owes what.{' '}
                <a href="/app" className="text-uv-green underline underline-offset-4">
                  Try it with a real document
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* ---------- how it works ---------- */}
        <Section
          id="how"
          title="Five steps. Only one touches the cloud."
          lede="Envoy runs your request through Firebase AI Logic hybrid inference and picks the mode per step: on the device for anything private, the cloud only for the reasoning, over tags."
        >
          <div className="overflow-hidden rounded-[22px] border border-uv-line bg-uv-deep">
            <DelegationScene />
          </div>
          <ol className="m-0 mt-12 grid list-none gap-x-8 gap-y-10 p-0 md:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => {
              const emblem = STEP_EMBLEMS.find((e) => e.key === s.key);
              const cloud = s.where === 'Cloud';
              return (
                <li key={s.key} className="flex gap-4">
                  {emblem && (
                    <div className="flex-none">
                      <StepEmblem step={emblem} size={72} showLabel={false} />
                    </div>
                  )}
                  <div>
                    <p className="m-0 font-mono text-[12.5px] text-uv-muted">
                      Step {i + 1}{' '}
                      <span className={cloud ? 'text-uv-blue' : 'text-uv-green'}>{s.where}</span>
                    </p>
                    <h3 className="mt-1 mb-2 text-[19px] font-semibold text-uv-text">{s.title}</h3>
                    <p className="m-0 text-[15.5px] leading-relaxed text-uv-muted">{s.body}</p>
                    <p className="mt-3 mb-0 flex flex-wrap items-center gap-2 text-[13px]">
                      <span
                        className={`rounded-full border px-2 py-0.5 font-mono text-[12px] ${cloud ? 'border-uv-blue/50 text-uv-blue' : 'border-uv-green/40 text-uv-green'}`}
                      >
                        {s.mode}
                      </span>
                      <CodeLink path={s.code[0]} line={s.code[1]} />
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>

        {/* ---------- the guard ---------- */}
        <Section
          id="guard"
          title="We don't trust the default."
          lede="Firebase AI Logic's on-device-only mode can silently use the cloud when Chrome's model is missing (firebase-js-sdk #10635). So every private step is checked, fenced and verified, and every outgoing excerpt is checked again."
        >
          <ul className="m-0 grid list-none gap-px overflow-hidden rounded-[22px] border border-uv-line bg-uv-line p-0 md:grid-cols-2">
            {GUARD.map(([title, body, [path, line]]) => (
              <li key={title} className="bg-uv-dark p-7">
                <h3 className="m-0 text-[18px] font-semibold text-uv-text">{title}</h3>
                <p className="mt-2 mb-3 text-[15.5px] leading-relaxed text-uv-muted">{body}</p>
                <CodeLink path={path} line={line} />
              </li>
            ))}
          </ul>
          <Measured summary={evalSummary} />
        </Section>

        {/* ---------- extension ---------- */}
        <Section
          id="extension"
          title="Envoy on every text box you type into."
          lede="The Chrome extension brings the same protection to the sites you choose: plain text boxes and rich editors (tested with ProseMirror and Quill, the editor libraries many chat and mail sites use). Turn it on for a site and the box lights up. Turn it off and it is an ordinary text box."
        >
          <div className="grid gap-5 md:grid-cols-3">
            {[
              [
                'Any text box',
                'See what is private as you type, adjust it in the Envoy card, then apply the masked text to the field in one click.',
              ],
              [
                'Upload with Envoy',
                'Before a PDF, document or photo goes up, Envoy masks the text, strips photo location data, and shows you what will be sent.',
              ],
              [
                'Your own rules',
                'Add the words only you know are private, like a project name or a client. They stay on your device.',
              ],
            ].map(([t, b]) => (
              <div key={t} className="rounded-[18px] border border-uv-line bg-uv-panel/60 p-6">
                <h3 className="m-0 text-[18px] font-semibold text-uv-text">{t}</h3>
                <p className="mt-2 mb-0 text-[15.5px] leading-relaxed text-uv-muted">{b}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {/* Until a packaged release is published, this goes to the install guide (load unpacked). */}
            <a
              href={src('apps/extension/README.md')}
              className="rounded-full bg-uv-blue px-6 py-3 text-[16px] font-semibold text-uv-deep shadow-[0_0_32px_-8px_var(--uv-blue)] hover:brightness-110"
            >
              Get the extension
            </a>
            <span className="text-[15px] text-uv-muted">
              Installs in a minute: load it unpacked in Chrome.
            </span>
          </div>
        </Section>

        {/* ---------- judges ---------- */}
        <Section
          id="judges"
          title="Judges: a two-minute test."
          lede="Everything runs in your browser. The sample contract and every person in it are fictional."
        >
          <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
            {[
              [
                'Open Envoy and load the sample lease.',
                'It works on any Chrome. Without the on-device model you get Basic protection, and the app says so.',
              ],
              [
                'Ask: "Can my landlord raise the rent 20% this year?"',
                'Watch the steps run on your device, each one labelled with where it ran and how long it took.',
              ],
              [
                'Read exactly what the cloud will see.',
                'Names, amounts and accounts are already tags. Share or hide anything, then approve.',
              ],
              [
                'Check the answer and the receipt.',
                'The rent cap comes back with your real numbers, worked out on your device. Add ?inspect=1 to watch every request.',
              ],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-4 rounded-[18px] border border-uv-line p-6">
                <span className="font-display text-[34px] leading-none text-uv-green">{i + 1}</span>
                <div>
                  <h3 className="m-0 text-[17px] font-semibold text-uv-text">{t}</h3>
                  <p className="mt-1.5 mb-0 text-[15px] leading-relaxed text-uv-muted">{b}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="/app?sample=lease"
              className="rounded-full bg-uv-green px-6 py-3 text-[16px] font-semibold text-uv-deep hover:brightness-110"
            >
              Start the test
            </a>
            <a
              href={REPO}
              className="rounded-full border border-uv-line px-6 py-3 text-[16px] text-uv-text hover:border-uv-green/60"
            >
              Read the code
            </a>
          </div>
        </Section>
      </main>

      <footer className="border-t border-uv-line/70">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-[14px] text-uv-muted sm:px-8">
          <p className="m-0">
            Open source under Apache-2.0. Inspired by PAPILLON (Li et al., NAACL 2025). Built for
            #BuildHybridAI with Firebase AI Logic.
          </p>
          <span className="flex gap-5">
            <a href="/privacy" className="hover:text-uv-text">
              Privacy policy
            </a>
            <a href={REPO} className="hover:text-uv-text">
              github.com/hesham88/envoy
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

/** Measured results, read straight from tests/eval/summary.json. Nothing is shown that wasn't measured. */
export function Measured({ summary }: { summary: EvalSummary | null }) {
  if (!summary) {
    return (
      <p className="mt-10 mb-0 max-w-[62ch] rounded-[16px] border border-dashed border-uv-line p-5 text-[15px] leading-relaxed text-uv-muted">
        Measured results (leaks after the guard, re-identification attacks, answer quality) publish
        here from the eval harness, each with the model, its version, the date and the number of
        cases.{' '}
        <a href={src('docs/MEASUREMENT.md')} className="text-uv-blue underline underline-offset-4">
          Method
        </a>
      </p>
    );
  }
  const pct = (v: unknown) => (typeof v === 'number' ? `${Math.round(v * 100)}%` : '–');
  return (
    <div className="mt-10 overflow-x-auto rounded-[16px] border border-uv-line">
      <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
        <caption className="px-5 pt-4 pb-2 text-left text-[14px] text-uv-muted">
          Measured through the real pipeline, on the dates in each row. n is the number of documents
          run; "text sent" counts only the document's own text, not the question.{' '}
          <a href={src('docs/EVAL.md')} className="text-uv-blue underline underline-offset-4">
            full results
          </a>
          .
        </caption>
        <thead>
          <tr className="text-uv-muted">
            {[
              'Setup',
              'Model',
              'n',
              'Private details masked',
              'Leaks after the guard',
              'Document text sent',
            ].map((h) => (
              <th key={h} scope="col" className="border-b border-uv-line px-5 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summary.arms.map((a) => (
            <tr key={a.id}>
              <th
                scope="row"
                className="border-b border-uv-line/60 px-5 py-3 font-medium text-uv-text"
              >
                {a.label}
              </th>
              <td className="border-b border-uv-line/60 px-5 py-3 text-uv-muted">
                {a.model ? `${a.model.label} (${a.model.version})` : 'None (local rules)'}
                {a.measuredOn?.length ? (
                  <span className="block text-[12.5px]">measured {a.measuredOn.join(', ')}</span>
                ) : null}
              </td>
              <td className="border-b border-uv-line/60 px-5 py-3 text-uv-muted">
                {a.n}
                {a.n < a.nTotal ? ` of ${a.nTotal}` : ''}
              </td>
              <td className="border-b border-uv-line/60 px-5 py-3 text-uv-green">
                {pct(a.metrics.maskRecall)}
              </td>
              <td className="border-b border-uv-line/60 px-5 py-3 text-uv-text">
                {typeof a.metrics.outboundLeaks === 'number' ? a.metrics.outboundLeaks : '–'}
              </td>
              <td className="border-b border-uv-line/60 px-5 py-3 text-uv-text">
                {pct(a.metrics.minimizationRatio)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
