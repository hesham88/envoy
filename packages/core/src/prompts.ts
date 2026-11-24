/**
 * On-device prompts (v1) and strict parsers for their replies.
 * Small-model rules applied: one task per call, `##` sections, XML-delimited untrusted input,
 * enum-constrained JSON, short outputs, and nothing trusted that isn't verbatim in the source.
 */
import type { Chunk, Entity, EntityType } from './types';

export const PROMPT_VERSION = 'v1';

export const ENTITY_KINDS = ['PERSON', 'ORG', 'ADDRESS', 'MONEY'] as const;
export const ENTITY_ROLES = [
  'landlord',
  'tenant',
  'employer',
  'employee',
  'patient',
  'doctor',
  'witness',
  'agent',
  'rent',
  'deposit',
  'salary',
  'fee',
  'other',
] as const;

export const DETECT_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          kind: { type: 'string', enum: [...ENTITY_KINDS] },
          role: { type: 'string', enum: [...ENTITY_ROLES] },
        },
        required: ['text', 'kind', 'role'],
      },
    },
  },
  required: ['entities'],
} as const;

export const MINIMIZE_SCHEMA = {
  type: 'object',
  properties: {
    clause_ids: { type: 'array', items: { type: 'integer' } },
    reason: { type: 'string' },
  },
  required: ['clause_ids', 'reason'],
} as const;

export const ROUTE_SCHEMA = {
  type: 'object',
  properties: { answerable_locally: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['answerable_locally', 'reason'],
} as const;

const clausesXml = (chunks: Chunk[]) =>
  chunks.map((c) => `<clause id="${c.id}">${c.text}</clause>`).join('\n');

export function buildDetectPrompt(text: string, question: string): string {
  return `## Task
List every person, organization, street address and money amount in the document, with its role in this document.

## Rules
- Copy each item exactly as written in the document.
- kind is one of: ${ENTITY_KINDS.join(', ')}.
- role is one of: ${ENTITY_ROLES.join(', ')}.
- Do not invent items. If unsure, leave it out.

## Example output
{"entities":[{"text":"Alex Example","kind":"PERSON","role":"employee"},{"text":"USD 10","kind":"MONEY","role":"fee"}]}

## Question the user will ask
<question>${question}</question>

## Document
<document>
${text}
</document>`;
}

export function buildMinimizePrompt(chunks: Chunk[], question: string): string {
  return `## Task
Pick the fewest clauses needed to answer the question. Return their ids and a one-line reason.

## Question
<question>${question}</question>

## Clauses
${clausesXml(chunks)}`;
}

export function buildRoutePrompt(question: string, chunks: Chunk[]): string {
  return `## Task
Decide if the question asks for a fact written directly in these clauses (a date, a name, an amount, a period).
answerable_locally is true only for such simple lookups. It is false for anything that needs judgement, comparison, calculation or advice.

## Question
<question>${question}</question>

## Clauses
${clausesXml(chunks)}`;
}

/**
 * True when a question asks for a figure that has to be worked out (a percentage, an amount, a cap,
 * a what-if), not read off the page. Small on-device models state the formula instead of the number
 * on these, so they always go to the reasoning step, which writes {{EXPR}} for local evaluation.
 * Duration lookups ("how much notice") stay eligible for a local answer.
 */
export function needsCalculation(question: string): boolean {
  const q = question.replace(/\bhow much (notice|time)\b/gi, '');
  return /%|\bpercent(age)?\b|\bhow much\b|\b(maximum|minimum|most|least)\b|(^|[.?!]\s*)if\b/i.test(
    q,
  );
}

/** The model's route, overridden to the reasoning step when the question needs a calculation. */
export function guardRoute(
  question: string,
  route: { local: boolean; reason: string },
): { local: boolean; reason: string } {
  if (!route.local || !needsCalculation(question)) return route;
  return {
    local: false,
    reason:
      'It needs a calculation, so it goes to the reasoning step, masked; the numbers are worked out on this device.',
  };
}

export function buildLocalAnswerPrompt(question: string, chunks: Chunk[]): string {
  return `## Task
Answer the question in one or two sentences, using only these clauses. Name the clause you used. If the clauses do not say, reply exactly: The document does not say.

## Question
<question>${question}</question>

## Clauses
${clausesXml(chunks)}`;
}

// ---------- parsers ----------

function parseJson(raw: string): unknown {
  const unfenced = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(unfenced);
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Words that name a role in a document, never a particular person or company. */
const GENERIC_PARTY =
  /^(?:the\s+)?(?:company|employer|employee|landlord|tenant|lessor|lessee|client|contractor|consultant|bank|lender|borrower|patient|physician|doctor|buyer|seller|party|parties|guarantor|licensor|licensee|provider|customer|supplier|agent|owner)s?$/i;
const CURRENCY =
  /(?:EGP|USD|EUR|GBP|SAR|AED|LE|L\.E\.|[$€£¥]|\b(?:pounds?|dollars?|euros?|riyals?|dirhams?)\b)/i;

/**
 * Drops model findings that can't be what the model says: a generic role word as a name or company
 * ("the Company"), or a bare number as money ("90" in "ninety (90) days" is a duration). Masking
 * them hides meaning, and their lowercase or spelled-out forms would then block the send.
 */
function plausible(kind: EntityType, value: string): boolean {
  if ((kind === 'PERSON' || kind === 'ORG') && GENERIC_PARTY.test(value)) return false;
  if (kind === 'MONEY' && !CURRENCY.test(value)) return false;
  return true;
}

/** Keeps only entities whose text appears verbatim in the source; returns every occurrence. */
export function parseDetectResponse(raw: string, source: string): Entity[] {
  const data = parseJson(raw);
  if (!isRecord(data) || !Array.isArray(data.entities)) return [];
  const out: Entity[] = [];
  for (const item of data.entities) {
    if (!isRecord(item)) continue;
    const { text, kind, role } = item;
    if (typeof text !== 'string' || text.trim().length < 2) continue;
    if (!(ENTITY_KINDS as readonly unknown[]).includes(kind)) continue;
    if (!(ENTITY_ROLES as readonly unknown[]).includes(role)) continue;
    const needle = text.trim();
    if (!plausible(kind as EntityType, needle)) continue;
    for (let i = source.indexOf(needle); i !== -1; i = source.indexOf(needle, i + needle.length)) {
      const entity: Entity = {
        type: kind as EntityType,
        value: needle,
        start: i,
        end: i + needle.length,
        confidence: 0.8,
        source: 'nano',
      };
      if (role !== 'other') entity.role = role as string;
      out.push(entity);
    }
  }
  return out;
}

export function parseMinimizeResponse(
  raw: string,
  validIds: number[],
): { ids: number[]; reason: string } | null {
  const data = parseJson(raw);
  if (!isRecord(data) || !Array.isArray(data.clause_ids)) return null;
  const valid = new Set(validIds);
  const ids = [
    ...new Set(
      data.clause_ids.filter((n): n is number => Number.isInteger(n) && valid.has(n as number)),
    ),
  ].sort((a, b) => a - b);
  if (ids.length === 0) return null;
  return { ids, reason: typeof data.reason === 'string' ? data.reason : '' };
}

export function parseRouteResponse(raw: string): { local: boolean; reason: string } | null {
  const data = parseJson(raw);
  if (!isRecord(data) || typeof data.answerable_locally !== 'boolean') return null;
  return {
    local: data.answerable_locally,
    reason: typeof data.reason === 'string' ? data.reason : '',
  };
}
