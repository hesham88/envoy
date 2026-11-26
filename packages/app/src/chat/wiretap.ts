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
  /** `payload` is the person's excerpt; `instructions` are Envoy's fixed lines sent with it. */
  | { kind: 'out'; model: string; payload: string; refused: boolean; instructions?: string }
  | { kind: 'in'; payload: string }
  /** An expression the cloud wrote; `value` is what the device worked out, or null if it couldn't. */
  | { kind: 'worked'; expr: string; value: string | null };

export interface WiretapView {
  cards: WiretapCard[];
  docChars: number;
  sentChars: number;
  nothingLeft: boolean;
}

/** Where Envoy's fixed instructions end and the approved excerpt begins (buildReasonPrompt). */
const EXCERPT = '\n\n## Excerpt\n';

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
      const cut = e.payload.indexOf(EXCERPT);
      const excerpt = cut >= 0 ? e.payload.slice(cut + EXCERPT.length) : e.payload;
      cards.push({
        kind: 'out',
        model: afterRefusal ? (opts.fallbackModel ?? opts.cloudModel) : opts.cloudModel,
        ...(cut >= 0 ? { instructions: e.payload.slice(0, cut) } : {}),
        payload: excerpt,
        refused,
      });
      // Counted like the receipt: the person's (masked) excerpt, not Envoy's fixed instructions.
      sentChars += excerpt.length;
      afterRefusal = refused;
    }
  });
  return { cards, docChars: opts.docText.length, sentChars, nothingLeft: sentChars === 0 };
}
