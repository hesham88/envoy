/**
 * Person-like names the deterministic rules can't know about. Used by Basic protection (no on-device
 * model) and by the live scan: flagged with low confidence, masked by default, shown for review.
 */
import type { Entity } from './types';

const NAME_STOPWORDS = new Set(
  'the this that these those either each any both all residential lease agreement landlord tenant premises arab republic egypt cairo maadi road street clause clauses rent deposit utilities maintenance payment entry termination notices governing signed building flat use parties term contract notice page january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday patient record member billing contractor client company employee employer section schedule annex appendix subject terms conditions invoice account statement policy dear hello hi thanks thank regards best kind please our your my we you they he she it its can could would should will may might also reach about from with google chrome envoy firebase gemini nano gmail chatgpt claude project'.split(
    ' ',
  ),
);

/** Person-like names the rules can't know about (Basic protection): flagged, and masked by default. */
// Words of a name are separated by spaces or tabs, never a line break: "Mona Adel\nEmail: ..." is
// a name followed by a label on the next line, not a three-word name.
const NAME_PATTERNS: RegExp[] = [
  // Title + name: "Dr. Omar", "Mrs Hala Samir"
  /\b(?:Mr|Mrs|Ms|Miss|Dr|Prof|Eng)\.?[ \t]+[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)*/g,
  // Capitalised names, allowing Arabic-name particles, spaced or hyphenated:
  // "Mohamed El Sayed", "Nour Al Din", "Hisham El-Masry", "Abdel-Rahman Ali", "Karim Fathy"
  /\b[A-Z][a-z]{2,}(?:-[A-Z][a-z]+)*(?:[ \t]+(?:El|Al|Abdel|Abd|Abu|Bin|Ibn|de|van|von))?(?:[ \t]+[A-Z][a-z]+(?:-[A-Z][a-z]+)*)+/g,
  // Names in capitals: "AHMED HASSAN"
  /\b[A-Z]{3,}(?:[ \t]+[A-Z]{3,})+\b/g,
];

export function flagNames(text: string, taken: Entity[]): Entity[] {
  const out: Entity[] = [];
  for (const [i, re] of NAME_PATTERNS.entries()) {
    for (const m of text.matchAll(re)) {
      // Title matches are names by construction. Otherwise, split the match at stopwords and keep
      // each run of two or more name words, so "Landlord Karim Fathy" yields "Karim Fathy" instead
      // of being thrown away because "Landlord" is a stopword.
      const spans: [number, number][] = [];
      if (i === 0) spans.push([m.index, m.index + m[0].length]);
      else {
        let run: { start: number; end: number; n: number } | null = null;
        const flush = () => {
          if (run && run.n >= 2) spans.push([run.start, run.end]);
          run = null;
        };
        for (const w of m[0].matchAll(/\S+/g)) {
          const word = w[0];
          const start = m.index + w.index;
          if (word.split('-').some((part) => NAME_STOPWORDS.has(part.toLowerCase()))) flush();
          else if (!run) run = { start, end: start + word.length, n: 1 };
          else {
            run.end = start + word.length;
            run.n++;
          }
        }
        flush();
      }
      for (const [start, end] of spans) {
        const e: Entity = {
          type: 'PERSON',
          value: text.slice(start, end),
          start,
          end,
          confidence: 0.4,
          source: 'rules',
        };
        if (![...taken, ...out].some((t) => t.start < e.end && e.start < t.end)) out.push(e);
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
