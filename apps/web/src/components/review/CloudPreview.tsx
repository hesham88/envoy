import { useId, useState, type Dispatch } from 'react';
import { Cloud } from 'lucide-react';
import type { Leak, Receipt } from '@envoy/core';
import type { SessionAction } from '../../app/session';

const LEAK_LABEL: Record<string, string> = {
  IBAN: 'a bank account (IBAN)',
  NATIONAL_ID: 'a national ID',
  PHONE: 'a phone number',
  EMAIL: 'an email address',
  CARD: 'a card number',
  MONEY: 'a private amount',
  DATE: 'a date',
  PERSON: 'a name',
  ADDRESS: 'an address',
  ORG: 'an organisation',
};

/** Renders the excerpt with tags as dark chips, exactly as the cloud will receive it. */
export function TaggedText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[A-Z][A-Z0-9_]*\]|\[…\])/).map((part, i) =>
        /^\[(?:[A-Z][A-Z0-9_]*|…)\]$/.test(part) ? (
          <span key={i} className="mx-px rounded bg-ink px-1.5 py-px text-paper">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

interface Props {
  outbound: string;
  guard: { ok: boolean; leaks: Leak[] };
  receipt: Receipt;
  edited: boolean;
  sending: boolean;
  dispatch: Dispatch<SessionAction>;
  onApprove: () => void;
}

export function CloudPreview({ outbound, guard, receipt, edited, sending, dispatch, onApprove }: Props) {
  const [editing, setEditing] = useState(false);
  const titleId = useId();
  const boxId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3.5 rounded-card border-2 border-cloud bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id={titleId} className="m-0 text-lg font-bold">
          What the cloud will see
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-cloud-tint px-2.5 py-0.5 text-[13px] font-semibold text-cloud-on-tint">
          <Cloud size={14} strokeWidth={2} aria-hidden="true" />
          {sending ? 'Sending…' : 'Waiting for your approval'}
        </span>
      </div>

      {editing ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={boxId} className="text-sm font-semibold">
            Excerpt to send (checked again as you type)
          </label>
          <textarea
            id={boxId}
            rows={10}
            value={outbound}
            onChange={(e) => dispatch({ type: 'EDIT_OUTBOUND', text: e.target.value })}
            className="rounded-[10px] border border-line bg-paper p-4 font-mono text-sm leading-relaxed text-ink"
          />
        </div>
      ) : (
        <div className="max-h-[420px] overflow-auto rounded-[10px] bg-paper p-4 font-mono text-sm leading-[1.75] whitespace-pre-wrap text-ink">
          <TaggedText text={outbound} />
        </div>
      )}

      {!guard.ok && (
        <div role="alert" className="rounded-[10px] bg-danger-tint px-4 py-3 text-sm text-danger">
          <strong>Blocked before sending.</strong> The excerpt still contains{' '}
          {guard.leaks.map((l, i) => (
            <span key={i}>
              {i > 0 ? ', ' : ''}
              {LEAK_LABEL[l.type] ?? 'a personal detail'} (<code className="font-mono">{l.value}</code>)
            </span>
          ))}
          . Remove it or mask it to continue.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[10px] bg-cloud-tint/60 p-3">
          <div className="text-2xl font-bold text-cloud-on-tint">
            {receipt.clausesSent} {receipt.clausesSent === 1 ? 'clause' : 'clauses'}
          </div>
          <div className="text-[13px] text-muted">shared, out of {receipt.pagesTotal} pages</div>
        </div>
        <div className="rounded-[10px] bg-device-tint p-3">
          <div className="text-2xl font-bold text-device-on-tint">
            {receipt.sharedByUser} {receipt.sharedByUser === 1 ? 'identity' : 'identities'}
          </div>
          <div className="text-[13px] text-muted">leave your device</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button
          onClick={onApprove}
          disabled={!guard.ok || sending}
          className="min-h-12 flex-[1_1_160px] rounded-control bg-ink px-4 py-3 font-semibold text-paper disabled:cursor-not-allowed disabled:opacity-40"
        >
          Approve and send
        </button>
        <button
          onClick={() => setEditing(!editing)}
          aria-pressed={editing}
          className="min-h-12 flex-[1_1_120px] rounded-control border border-line bg-surface px-4 py-3 font-semibold"
        >
          {editing ? 'Done editing' : 'Edit excerpt'}
        </button>
      </div>
      {edited && !editing && <p className="m-0 text-[13px] text-muted-2">You edited this excerpt by hand. Changing a highlight resets it.</p>}
    </section>
  );
}
