/**
 * Person-like names the deterministic rules can't know about. Used by Basic protection (no on-device
 * model) and by the live scan: flagged with low confidence, masked by default, shown for review.
 */
import type { Entity } from './types';

const NAME_STOPWORDS = new Set(
  'the this that these those either each any both all residential lease agreement landlord tenant premises arab republic egypt cairo maadi road street clause clauses rent deposit utilities maintenance payment entry termination notices governing signed building flat use parties term contract notice page january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday dear hello hi thanks thank regards best kind please our your my we you they he she it its can could would should will may might also reach about from with google chrome envoy firebase gemini nano gmail chatgpt claude project'.split(
    ' ',
  ),
);

/** Person-like names the rules can't know about (Basic protection): flagged, and masked by default. */
const NAME_PATTERNS: RegExp[] = [
  // Title + name: "Dr. Omar", "Mrs Hala Samir"
  /\b(?:Mr|Mrs|Ms|Miss|Dr|Prof|Eng)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g,
  // Capitalised names, allowing Arabic-name particles: "Mohamed El Sayed", "Nour Al Din", "Karim Fathy"
  /\b[A-Z][a-z]{2,}(?:\s+(?:El|Al|Abdel|Abd|Abu|Bin|Ibn|de|van|von))?(?:\s+[A-Z][a-z]{2,})+/g,
  // Names in capitals: "AHMED HASSAN"
  /\b[A-Z]{3,}(?:\s+[A-Z]{3,})+\b/g,
];

export function flagNames(text: string, taken: Entity[]): Entity[] {
  const out: Entity[] = [];
  for (const [i, re] of NAME_PATTERNS.entries()) {
    for (const m of text.matchAll(re)) {
      const words = m[0].split(/\s+/).filter((w) => !/^(Mr|Mrs|Ms|Miss|Dr|Prof|Eng)\.?$/.test(w));
      if (i > 0 && words.some((w) => NAME_STOPWORDS.has(w.toLowerCase()))) continue;
      const e: Entity = {
        type: 'PERSON',
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
        confidence: 0.4,
        source: 'rules',
      };
      if (![...taken, ...out].some((t) => t.start < e.end && e.start < t.end)) out.push(e);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
