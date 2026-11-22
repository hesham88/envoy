/**
 * Restore: runs on the device after the cloud answers. Tags become real values again, and
 * `{{RENT * 1.10}}` expressions are computed locally, so the cloud never sees the real amount.
 */
import { evaluate, parseAmount } from './expr';
import type { TagMap } from './tags';

export const CLOUD_EXPRESSION_INSTRUCTION =
  'When you need a number derived from a tagged amount, write it as {{TAG * factor}} (for example {{RENT * 1.10}}); never guess the real value.';

export interface RestoredSpan {
  start: number;
  end: number;
  tag: string;
  value: string;
  computed: boolean;
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function restoreAnswer(answer: string, tags: TagMap): { text: string; spans: RestoredSpan[] } {
  const amounts: Record<string, number> = {};
  const currencies: Record<string, string> = {};
  for (const e of tags.entries()) {
    if (e.type !== 'MONEY') continue;
    const parsed = parseAmount(e.value);
    if (!parsed) continue;
    const name = e.tag.slice(1, -1);
    amounts[name] = parsed.amount;
    currencies[name] = parsed.currency;
  }

  const spans: RestoredSpan[] = [];
  let text = '';
  let last = 0;
  for (const m of answer.matchAll(/\{\{\s*([^{}]*?)\s*\}\}|\[([A-Z][A-Z0-9_]*)\]/g)) {
    let replacement: string | null = null;
    let computed = false;
    if (m[2] !== undefined) {
      replacement = tags.valueOf(`[${m[2]}]`) ?? null;
    } else {
      const result = evaluate(m[1]!, amounts);
      if (result !== null) {
        const currency = Object.keys(currencies).find((name) => new RegExp(`\\b${name}\\b`).test(m[1]!));
        replacement = currency && currencies[currency] ? `${currencies[currency]} ${fmt(result)}` : fmt(result);
        computed = true;
      }
    }
    text += answer.slice(last, m.index);
    if (replacement === null) {
      text += m[0];
    } else {
      spans.push({ start: text.length, end: text.length + replacement.length, tag: m[0], value: replacement, computed });
      text += replacement;
    }
    last = m.index + m[0].length;
  }
  text += answer.slice(last);
  return { text, spans };
}
