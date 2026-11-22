/**
 * Merging, meaning-preserving tags and masking.
 * The tag map lives only in memory: it is never stored or sent anywhere.
 */
import type { Entity, EntityType } from './types';

const CURRENCY_CODES: [RegExp, string][] = [
  [/US\$|USD|\$|dollars?/i, 'USD'],
  [/€|EUR|euros?/i, 'EUR'],
  [/£|GBP/i, 'GBP'],
  [/EGP|L\.E\.|\bLE\b|pounds?|ج\.م|جنيه/i, 'EGP'],
];

/** A comparison key, so the same value in different formats gets the same tag (and is caught by the guard). */
export function canonical(value: string, type: EntityType): string {
  switch (type) {
    case 'PHONE': {
      let d = value.replace(/\D/g, '');
      if (d.startsWith('0020')) d = '0' + d.slice(4);
      else if (d.startsWith('20') && d.length === 12) d = '0' + d.slice(2);
      return d;
    }
    case 'MONEY': {
      const currency = CURRENCY_CODES.find(([re]) => re.test(value))?.[1] ?? '';
      const num = value.match(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/)?.[0] ?? '';
      return `${currency}:${Number(num.replace(/,/g, ''))}`;
    }
    case 'IBAN':
    case 'NATIONAL_ID':
    case 'CARD':
      return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    case 'EMAIL':
      return value.trim().toLowerCase();
    default:
      return value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
  }
}

const overlaps = (a: Entity, b: Entity) => a.start < b.end && b.start < a.end;

/** Rules win on overlap; a role the model found is kept on the rules entity it overlaps. */
export function mergeEntities(rules: Entity[], nano: Entity[]): Entity[] {
  const merged: Entity[] = rules.map((r) => {
    const role = r.role ?? nano.find((n) => n.role && overlaps(n, r))?.role;
    return role ? { ...r, role } : { ...r };
  });
  const byLength = [...nano].sort((a, b) => b.end - b.start - (a.end - a.start));
  for (const n of byLength) {
    if (!merged.some((m) => overlaps(m, n))) merged.push(n);
  }
  return merged.sort((a, b) => a.start - b.start);
}

export interface TagMap {
  tagOf(e: Entity): string;
  valueOf(tag: string): string | undefined;
  entries(): { tag: string; value: string; type: EntityType }[];
}

const TYPE_BASE: Record<EntityType, string> = {
  PERSON: 'PERSON',
  ORG: 'ORG',
  ADDRESS: 'ADDRESS',
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  NATIONAL_ID: 'NATIONAL_ID',
  IBAN: 'ACCOUNT',
  CARD: 'CARD',
  MONEY: 'AMOUNT',
  DATE: 'DATE',
};

/** The same canonical value always gets the same tag; distinct values sharing a base get _2, _3… */
export function assignTags(entities: Entity[]): TagMap {
  const byKey = new Map<string, string>();
  const byTag = new Map<string, { value: string; type: EntityType }>();
  const counts = new Map<string, number>();
  const key = (e: Entity) => `${e.type}:${canonical(e.value, e.type)}`;

  for (const e of [...entities].sort((a, b) => a.start - b.start)) {
    const k = key(e);
    if (byKey.has(k)) continue;
    const base = e.role ? e.role.toUpperCase().replace(/[^A-Z0-9]+/g, '_') : TYPE_BASE[e.type];
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    const tag = e.type === 'DATE' && !e.role ? `[${base}_${n}]` : n === 1 ? `[${base}]` : `[${base}_${n}]`;
    byKey.set(k, tag);
    byTag.set(tag, { value: e.value, type: e.type });
  }

  return {
    tagOf: (e) => byKey.get(key(e)) ?? `[${TYPE_BASE[e.type]}]`,
    valueOf: (tag) => byTag.get(tag)?.value,
    entries: () => [...byTag].map(([tag, v]) => ({ tag, value: v.value, type: v.type })),
  };
}

/** Replaces every entity span with its tag. */
export function maskText(text: string, entities: Entity[], tags: TagMap): string {
  let out = text;
  for (const e of [...entities].sort((a, b) => b.start - a.start)) {
    if (e.start < 0 || e.end > text.length) continue;
    out = out.slice(0, e.start) + tags.tagOf(e) + out.slice(e.end);
  }
  return out;
}
