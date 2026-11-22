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

const TAG = /\[[A-Z][A-Z0-9_]*\]/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Tags are replaced by spaces of the same length, so offsets stay true and tags never count as leaks.
 * With `knownTags`, only tags that really exist are blanked: `[MONA_ADEL]` typed by hand is still checked.
 */
const withoutTags = (text: string, knownTags?: Iterable<string>) => {
  const known = knownTags ? new Set(knownTags) : null;
  return text.replace(TAG, (t) => (!known || known.has(t) ? ' '.repeat(t.length) : t));
};

/** Keeps only the characters `keep` accepts, with a map back to their original offsets. */
function compact(text: string, keep: RegExp): { out: string; map: number[] } {
  let out = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (keep.test(ch)) {
      out += ch.toUpperCase();
      map.push(i);
    }
  }
  return { out, map };
}

function findWords(text: string, value: string, type: EntityType): Leak[] {
  const words = canonical(value, type).split(' ').filter(Boolean);
  if (words.join('').length < 3) return [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${words.map(escape).join('[^\\p{L}\\p{N}]+')}(?![\\p{L}\\p{N}])`, 'giu');
  return [...text.matchAll(re)].map((m) => ({ value: m[0], type, index: m.index }));
}

/** Finds a protected number however it's punctuated, by searching a digits-only (or alphanumeric) copy. */
function findCodes(text: string, value: string, type: EntityType): Leak[] {
  let needle = canonical(value, type);
  if (type === 'PHONE') needle = needle.replace(/^0/, '');
  if (needle.length < 6) return [];
  const { out, map } = compact(text, type === 'PHONE' ? /\d/ : /[A-Za-z0-9]/);
  const leaks: Leak[] = [];
  for (let i = out.indexOf(needle); i !== -1; i = out.indexOf(needle, i + needle.length)) {
    const start = map[i]!;
    const end = map[i + needle.length - 1]! + 1;
    leaks.push({ value: text.slice(start, end), type, index: start });
  }
  return leaks;
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

export function checkOutbound(
  outbound: string,
  protectedEntities: Entity[],
  opts: { knownTags?: Iterable<string>; allowed?: Entity[] } = {},
): { ok: boolean; leaks: Leak[] } {
  const text = withoutTags(outbound, opts.knownTags);
  const allowed = opts.allowed ?? [];
  const amountOf = (v: string) => Number(canonical(v, 'MONEY').split(':')[1]);
  const isAllowed = (l: Leak) =>
    allowed.some((a) =>
      a.type === 'MONEY' && l.type === 'MONEY'
        ? amountOf(a.value) === amountOf(l.value)
        : a.type === l.type && canonical(a.value, a.type) === canonical(l.value, l.type),
    );
  protectedEntities = protectedEntities.filter((p) => !allowed.some((a) => a.type === p.type && canonical(a.value, a.type) === canonical(p.value, p.type)));
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
    if (!covered && !isAllowed(l)) leaks.push(l);
  }
  return { ok: leaks.length === 0, leaks };
}
