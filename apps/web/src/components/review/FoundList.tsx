import { useId } from 'react';
import type { Analysis } from '@envoy/ai';
import type { EntityType, Receipt } from '@envoy/core';

const LABELS: Record<EntityType, [string, string]> = {
  PERSON: ['Names', 'masked as roles'],
  ORG: ['Organisations', 'masked'],
  ADDRESS: ['Addresses', 'masked'],
  EMAIL: ['Email addresses', 'masked'],
  PHONE: ['Phone numbers', 'masked'],
  NATIONAL_ID: ['National IDs', 'masked'],
  IBAN: ['Bank accounts', 'masked'],
  CARD: ['Card numbers', 'masked'],
  MONEY: ['Amounts', 'masked; maths done on this device'],
  DATE: ['Dates', 'masked'],
};

export function FoundList({ analysis, receipt }: { analysis: Analysis; receipt: Receipt }) {
  const titleId = useId();
  const flagged = [...new Set(analysis.flaggedForReview.map((e) => e.value))];
  const rows = (Object.entries(receipt.found) as [EntityType, number][]).filter(([, n]) => n > 0);
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-2.5">
        <h2 id={titleId} className="m-0 text-base font-bold">
          Found on device
        </h2>
        <span className="text-[13px] text-muted-2">{receipt.foundTotal} personal items</span>
      </div>
      <ul className="m-0 flex list-none flex-col p-0 text-sm">
        {rows.map(([type, n]) => (
          <li key={type} className="flex justify-between gap-2.5 border-b border-line py-2 last:border-b-0">
            <span>{LABELS[type][0]}</span>
            <span className="text-muted">
              {n} · {type === 'PERSON' && analysis.mode === 'basic' ? 'masked; please check them' : LABELS[type][1]}
            </span>
          </li>
        ))}
      </ul>
      {flagged.length > 0 && (
        <div className="rounded-[10px] bg-detected/60 px-3.5 py-3 text-sm">
          <p className="m-0 font-semibold">Names to check (masked by default)</p>
          <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
            {flagged.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="m-0 text-[13px] text-muted-2">
        Found by {analysis.mode === 'private' ? 'local rules and the on-device model' : 'local rules (Basic protection)'}. Press any highlight to remove or share it.
      </p>
    </section>
  );
}
