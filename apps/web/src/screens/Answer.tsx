import { useId, useState } from 'react';
import { Receipt as ReceiptIcon } from 'lucide-react';
import type { RestoredSpan, Step } from '@envoy/core';
import type { AnswerResult } from '../app/session';
import { ModeChip } from '../components/ModeChip';
import { ProgressSteps } from './Review';

const STEP_LABEL: Record<Step, string> = {
  detect: 'Found personal details',
  minimize: 'Picked the clauses your question needs',
  route: 'Decided where to answer',
  answerLocal: 'Answered from your document',
  reason: 'Reasoned over the masked excerpt',
};

/** Text with restored values highlighted (they were put back on this device). */
function RestoredText({ text, spans, from, to }: { text: string; spans: RestoredSpan[]; from: number; to: number }) {
  const out: React.ReactNode[] = [];
  let at = from;
  for (const s of spans.filter((x) => x.start >= from && x.end <= to)) {
    if (s.start > at) out.push(text.slice(at, s.start));
    out.push(
      <mark
        key={s.start}
        data-restored="true"
        title={s.computed ? `Worked out on your device from ${s.tag}` : `Restored on your device from ${s.tag}`}
        className="rounded bg-restored px-1 py-px text-inherit"
      >
        {s.value}
      </mark>,
    );
    at = s.end;
  }
  if (at < to) out.push(text.slice(at, to));
  return <>{out}</>;
}

interface Props {
  question: string;
  result: AnswerResult;
  onFollowUp: (question: string) => void;
  onNew: () => void;
}

export function Answer({ question, result, onFollowUp, onNew }: Props) {
  const [follow, setFollow] = useState('');
  const [copied, setCopied] = useState(false);
  const followId = useId();
  const receiptId = useId();
  const r = result.receipt;
  const local = result.source === 'on_device';
  const verdictEnd = (() => {
    const m = /[.!?](\s|$)/.exec(result.text);
    return m ? m.index + 1 : result.text.length;
  })();
  const totalMs = r.steps.reduce((a, s) => a + s.ms, 0);
  let elapsed = 0;

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-5 px-8 py-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProgressSteps current={3} />
        <button onClick={onNew} className="min-h-11 rounded-control border border-line bg-surface px-4 text-sm font-semibold">
          New question
        </button>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="m-0 text-sm text-muted-2">Your question</p>
            <h1 tabIndex={-1} className="m-0 text-[22px] font-semibold">
              {question}
            </h1>
          </div>
          <article className="flex flex-col gap-4 rounded-card border border-line bg-surface p-7">
            <div className="flex flex-wrap gap-2">
              {!local && <ModeChip kind="cloud">Reasoned in the cloud</ModeChip>}
              {local && !result.lighter && <ModeChip kind="device">Answered on device</ModeChip>}
              {result.lighter && <ModeChip kind="device">Lighter on-device answer (cloud unreachable)</ModeChip>}
              <ModeChip kind="device">Personalized on device</ModeChip>
            </div>
            <p className="m-0 text-2xl leading-snug font-bold">
              <RestoredText text={result.text} spans={result.spans} from={0} to={verdictEnd} />
            </p>
            {verdictEnd < result.text.length && (
              <p className="m-0 text-[17px] leading-relaxed whitespace-pre-wrap text-ink">
                <RestoredText text={result.text} spans={result.spans} from={verdictEnd} to={result.text.length} />
              </p>
            )}
            {local && (
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  ['0', 'cloud calls'],
                  ['0 bytes', 'left this computer'],
                  [`${(totalMs / 1000).toFixed(1)}s`, 'to answer'],
                ].map(([big, small]) => (
                  <div key={small} className="rounded-[10px] bg-device-tint p-3.5">
                    <div className="text-[28px] font-bold text-device-on-tint">{big}</div>
                    <div className="text-[13px] text-muted">{small}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="m-0 border-t border-line pt-3.5 text-[13px] text-muted-2">
              Values highlighted in green were restored on your device{!local && `; the cloud only saw ${r.sharedTags.join(', ') || 'tags'}`}. This explains your
              document; it isn't legal advice.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={() => onFollowUp('Draft a short, polite reply to the other party based on this answer.')}
                className="min-h-11 rounded-control bg-ink px-4 text-[15px] font-semibold text-paper"
              >
                Draft a reply
              </button>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(result.text).then(() => setCopied(true));
                }}
                className="min-h-11 rounded-control border border-line bg-surface px-4 text-[15px] font-semibold"
              >
                {copied ? 'Copied' : 'Copy answer'}
              </button>
            </div>
          </article>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (follow.trim()) onFollowUp(follow.trim());
            }}
          >
            <label htmlFor={followId} className="text-[15px] font-semibold">
              Ask a follow-up
            </label>
            <input
              id={followId}
              value={follow}
              onChange={(e) => setFollow(e.target.value)}
              placeholder="e.g. What if he doesn't give 60 days' notice?"
              className="min-h-12 rounded-control border border-line bg-surface px-4 text-base text-ink"
            />
          </form>
        </section>

        <aside aria-labelledby={receiptId} role="region" className="flex min-w-0 flex-[1_1_360px] flex-col gap-4 rounded-card border border-line bg-surface p-6">
          <div className="flex items-center gap-2.5">
            <ReceiptIcon size={22} strokeWidth={1.75} aria-hidden="true" />
            <h2 id={receiptId} className="m-0 text-lg font-bold">
              Privacy receipt
            </h2>
          </div>
          <div className="rounded-[10px] bg-cloud-tint/60 p-3.5">
            <div className="text-[13px] font-semibold tracking-wider text-cloud-on-tint uppercase">Left your device</div>
            <div className="mt-1 text-xl font-bold">
              {r.clausesSent} {r.clausesSent === 1 ? 'clause' : 'clauses'} · {r.charsSent} characters
            </div>
            <div className="text-sm text-muted">
              {r.sharedTags.length} masked placeholders{r.sharedByUser > 0 ? ` · ${r.sharedByUser} detail(s) you chose to share` : ''}
            </div>
          </div>
          <div className="rounded-[10px] bg-device-tint p-3.5">
            <div className="text-[13px] font-semibold tracking-wider text-device-on-tint uppercase">Stayed on device</div>
            <div className="mt-1 text-xl font-bold">
              {r.keptTotal} personal items · {r.pagesTotal} pages
            </div>
            <div className="text-sm text-muted">{r.mode === 'private' ? 'Private mode (on-device model)' : 'Basic protection (local rules)'}</div>
          </div>
          <div>
            <h3 className="m-0 mb-2 text-sm font-semibold">What happened</h3>
            <ol className="m-0 flex list-none flex-col p-0">
              {r.steps.map((s, i) => {
                elapsed += s.ms;
                const cloud = s.source === 'in_cloud';
                return (
                  <li key={i} className="flex gap-3 border-b border-line py-2.5 text-sm last:border-b-0">
                    <span className="w-12 flex-none font-mono text-muted-2">{(elapsed / 1000).toFixed(1)}s</span>
                    <span className="flex-1">{STEP_LABEL[s.step]}</span>
                    <span className={`flex-none font-semibold ${cloud ? 'text-cloud-on-tint' : 'text-device-on-tint'}`}>{cloud ? 'Cloud' : s.source === 'rules' ? 'Rules' : 'Device'}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <p className="m-0 text-[13px] leading-normal text-muted-2">The link between placeholders and your real data lives only in this tab. It's erased when you close it.</p>
        </aside>
      </div>
    </main>
  );
}
