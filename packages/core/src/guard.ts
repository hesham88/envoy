/**
 * Outbound leak guard: runs right before any cloud call.
 * 1. Re-runs every rule detector on the outbound text (anything structured that isn't a tag is a leak).
 * 2. Looks for every protected value again, tolerant of reformatting (spacing, case, prefixes, currency).
 */
import { detectWithRules } from './rules';
import { canonical } from './tags';
import type { Entity, EntityType } from './types';

export interface Leak {
  value: string;
  type: EntityType;
  index: number;
}

const TAG = /\[[A-Z0-9_]+\]/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tags are replaced by spaces of the same length, so offsets stay true and tags never count as leaks. */
const withoutTags = (text: string) => text.replace(TAG, (t) => ' '.repeat(t.length));

function findWords(text: string, value: string, type: EntityType): Leak[] {
  const words = canonical(value, type).split(' ').filter(Boolean);
  if (words.join('').length < 3) return [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${words.map(escape).join('[^\\p{L}\\p{N}]+')}(?![\\p{L}\\p{N}])`, 'giu');
  return [...text.matchAll(re)].map((m) => ({ value: m[0], type, index: m.index }));
}

function findCodes(text: string, value: string, type: EntityType): Leak[] {
  let needle = canonical(value, type);
  if (type === 'PHONE') needle = needle.replace(/^0/, '');
  if (needle.length < 6) return [];
  const out: Leak[] = [];
  for (const m of text.matchAll(/[+\dA-Za-z][\dA-Za-z -]{4,}[\dA-Za-z]/g)) {
    const run = type === 'PHONE' ? m[0].replace(/\D/g, '') : m[0].replace(/[\s-]/g, '').toUpperCase();
    if (run.includes(needle)) out.push({ value: m[0].trim(), type, index: m.index });
  }
  return out;
}

function findAmount(text: string, value: string): Leak[] {
  const amount = Number(canonical(value, 'MONEY').split(':')[1]);
  if (!Number.isFinite(amount) || amount === 0) return [];
  const out: Leak[] = [];
  for (const m of text.matchAll(/(?<![\d.,])\d[\d,]*(?:\.\d+)?(?![\d%])/g)) {
    if (Number(m[0].replace(/,/g, '')) === amount) out.push({ value: m[0], type: 'MONEY', index: m.index });
  }
  return out;
}

export function checkOutbound(outbound: string, protectedEntities: Entity[]): { ok: boolean; leaks: Leak[] } {
  const text = withoutTags(outbound);
  const found: Leak[] = detectWithRules(text).map((e) => ({ value: e.value, type: e.type, index: e.start }));

  for (const p of protectedEntities) {
    switch (p.type) {
      case 'PHONE':
      case 'IBAN':
      case 'NATIONAL_ID':
      case 'CARD':
        found.push(...findCodes(text, p.value, p.type));
        break;
      case 'MONEY':
        found.push(...findAmount(text, p.value));
        break;
      default:
        found.push(...findWords(text, p.value, p.type));
    }
  }

  const leaks: Leak[] = [];
  for (const l of found.sort((a, b) => a.index - b.index || b.value.length - a.value.length)) {
    const covered = leaks.some((k) => l.index >= k.index && l.index + l.value.length <= k.index + k.value.length);
    if (!covered) leaks.push(l);
  }
  return { ok: leaks.length === 0, leaks };
}
