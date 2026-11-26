/**
 * The Wiretap view-model: what one turn did on the wire, from the in-memory network log.
 * Pure, so the pane only renders, and every claim it makes ("nothing left", "N characters sent")
 * comes from the same log the device guard writes.
 */
import type { NetworkEntry } from '@envoy/ai';
import type { RestoredSpan } from '@envoy/core';

export type WiretapCard =
  | { kind: 'device'; step: string; payload: string }
  | { kind: 'blocked'; step: string; payload: string }
  | { kind: 'out'; model: string; payload: string; refused: boolean }
  | { kind: 'in'; payload: string }
  /** An expression the cloud wrote; `value` is what the device worked out, or null if it couldn't. */
  | { kind: 'worked'; expr: string; value: string | null };

export interface WiretapView {
  cards: WiretapCard[];
  docChars: number;
  sentChars: number;
  nothingLeft: boolean;
}

export function buildWiretap(
  entries: readonly NetworkEntry[],
  opts: {
    docText: string;
    cloudModel: string;
    /** The model asked after the chosen one refused. */
    fallbackModel?: string;
    spans?: readonly RestoredSpan[];
    /** The turn's start: earlier entries belong to earlier turns. */
    since: number;
  },
): WiretapView {
  const turn = entries.filter((e) => e.at >= opts.since);
  const cards: WiretapCard[] = [];
  let sentChars = 0;
  let afterRefusal = false;
  turn.forEach((e, i) => {
    if (e.blocked) {
      cards.push({ kind: 'blocked', step: e.step, payload: e.payload });
    } else if (e.target === 'device') {
      cards.push({ kind: 'device', step: e.step, payload: e.payload });
    } else if (e.direction === 'in') {
      cards.push({ kind: 'in', payload: e.payload });
      for (const m of e.payload.matchAll(/\{\{[^{}]*\}\}/g)) {
        const hit = opts.spans?.find((s) => s.computed && s.tag === m[0]);
        cards.push({ kind: 'worked', expr: m[0], value: hit?.value ?? null });
      }
    } else {
      // A request followed by another before any reply was refused (the fallback was asked).
      const next = turn.slice(i + 1).find((n) => n.target === 'cloud' && !n.blocked);
      const refused = e.refused === true || (next !== undefined && next.direction !== 'in');
      cards.push({
        kind: 'out',
        model: afterRefusal ? (opts.fallbackModel ?? opts.cloudModel) : opts.cloudModel,
        payload: e.payload,
        refused,
      });
      sentChars += e.payload.length;
      afterRefusal = refused;
    }
  });
  return { cards, docChars: opts.docText.length, sentChars, nothingLeft: sentChars === 0 };
}
