/**
 * The Envoy pipeline: detect → minimize → route on the device (guarded), mask, check, then
 * answer locally or ask the cloud with the approved excerpt only, and restore on the device.
 * Without the on-device model it runs in Basic protection: rules only, zero model calls.
 */
import { InferenceSource, type GenerativeModel } from 'firebase/ai';
import {
  assignTags,
  buildDetectPrompt,
  buildLocalAnswerPrompt,
  buildMinimizePrompt,
  buildReceipt,
  buildRoutePrompt,
  checkOutbound,
  chunkDocument,
  CLOUD_EXPRESSION_INSTRUCTION,
  detectWithRules,
  estimateTokens,
  maskText,
  mergeEntities,
  parseDetectResponse,
  parseMinimizeResponse,
  parseRouteResponse,
  restoreAnswer,
  type Chunk,
  type Entity,
  type Leak,
  type Receipt,
  type ReceiptStep,
  type RestoredSpan,
  type Step,
  type TagMap,
} from '@envoy/core';
import { DeviceUnavailableError, type DeviceStatus, type runPrivate as RunPrivate } from './device-guard';
import { networkLog } from './network-log';

export interface Deps {
  runPrivate: typeof RunPrivate;
  models: Record<Step, GenerativeModel>;
  getDeviceStatus: () => Promise<DeviceStatus>;
}

export interface Analysis {
  question: string;
  chunks: Chunk[];
  entities: Entity[];
  tags: TagMap;
  selectedIds: number[];
  selectionReason: string;
  route: { local: boolean; reason: string };
  outbound: string;
  guard: { ok: boolean; leaks: Leak[] };
  receipt: Receipt;
  mode: 'private' | 'basic';
  flaggedForReview: Entity[];
  steps: ReceiptStep[];
}

export class OutboundBlockedError extends Error {
  override name = 'OutboundBlockedError';
  constructor(public readonly leaks: Leak[]) {
    super(`Blocked: the excerpt still contains ${leaks.length} personal detail(s).`);
  }
}

const MAX_TOKENS = 6000;

/** Greedy batches of chunks whose prompt stays within the token budget. */
function batchChunks(chunks: Chunk[], build: (batch: Chunk[]) => string, maxTokens: number): Chunk[][] {
  const batches: Chunk[][] = [];
  let current: Chunk[] = [];
  for (const c of chunks) {
    const next = [...current, c];
    if (current.length > 0 && estimateTokens(build(next)) > maxTokens) {
      batches.push(current);
      current = [c];
    } else {
      current = next;
    }
  }
  if (current.length) batches.push(current);
  return batches;
}

export async function selectClausesBatched(
  chunks: Chunk[],
  question: string,
  run: (prompt: string) => Promise<string>,
  maxTokens = MAX_TOKENS,
): Promise<{ ids: number[]; reason: string }> {
  const ids = new Set<number>();
  const reasons: string[] = [];
  for (const batch of batchChunks(chunks, (b) => buildMinimizePrompt(b, question), maxTokens)) {
    const parsed = parseMinimizeResponse(await run(buildMinimizePrompt(batch, question)), batch.map((c) => c.id));
    if (parsed) {
      parsed.ids.forEach((id) => ids.add(id));
      if (parsed.reason) reasons.push(parsed.reason);
    }
  }
  if (ids.size === 0) return { ids: chunks.map((c) => c.id), reason: 'No clause could be singled out, so every clause is included (masked).' };
  return { ids: [...ids].sort((a, b) => a - b), reason: reasons.join(' ') };
}

const NAME_STOPWORDS = new Set(
  'The This That These Those Either Each Any Both All Residential Lease Agreement Landlord Tenant Premises Arab Republic Egypt Cairo Maadi Road Street Clause Clauses Rent Deposit Utilities Maintenance Payment Entry Termination Notices Governing Signed Building Flat Use Parties Term January February March April May June July August September October November December'.split(
    ' ',
  ),
);

/** Basic protection: person-like name pairs the rules can't know about, flagged and masked by default. */
function flagNames(text: string, taken: Entity[]): Entity[] {
  const out: Entity[] = [];
  for (const m of text.matchAll(/\b([A-Z][a-z]{2,})\s+([A-Z][a-z]{2,})\b/g)) {
    if (NAME_STOPWORDS.has(m[1]!) || NAME_STOPWORDS.has(m[2]!)) continue;
    const e: Entity = { type: 'PERSON', value: m[0], start: m.index, end: m.index + m[0].length, confidence: 0.4, source: 'rules' };
    if (!taken.some((t) => t.start < e.end && e.start < t.end)) out.push(e);
  }
  return out;
}

function maskChunk(c: Chunk, entities: Entity[], tags: TagMap): string {
  const inside = entities
    .filter((e) => e.start >= c.start && e.end <= c.end)
    .map((e) => ({ ...e, start: e.start - c.start, end: e.end - c.start }));
  return maskText(c.text, inside, tags);
}

function maskQuestion(question: string, docEntities: Entity[], tags: TagMap): string {
  const found = detectWithRules(question);
  for (const e of docEntities) {
    for (let i = question.indexOf(e.value); i !== -1; i = question.indexOf(e.value, i + e.value.length)) {
      if (!found.some((f) => f.start < i + e.value.length && i < f.end)) found.push({ ...e, start: i, end: i + e.value.length });
    }
  }
  return maskText(question, found, tags);
}

export async function analyze(doc: string, question: string, deps: Deps): Promise<Analysis> {
  const chunks = chunkDocument(doc);
  const rules = detectWithRules(doc);
  const steps: ReceiptStep[] = [];
  let mode: 'private' | 'basic' = (await deps.getDeviceStatus()) === 'available' ? 'private' : 'basic';
  let entities = rules;
  let flagged: Entity[] = [];
  let selection = { ids: chunks.map((c) => c.id), reason: 'Basic protection: every clause is included, masked.' };
  let route = { local: false, reason: 'Basic protection: questions go to the reasoning step, masked.' };

  if (mode === 'private') {
    try {
      const run = async (step: Step, prompt: string) => {
        const r = await deps.runPrivate(deps.models[step], prompt, step);
        const prev = steps.find((s) => s.step === step);
        if (prev) prev.ms += r.ms;
        else steps.push({ step, source: 'on_device', ms: r.ms });
        return r.text;
      };

      const nano: Entity[] = [];
      const detectBatches = batchChunks(chunks, (b) => buildDetectPrompt(b.map((c) => c.text).join('\n\n'), question), MAX_TOKENS);
      for (const batch of detectBatches) {
        nano.push(...parseDetectResponse(await run('detect', buildDetectPrompt(batch.map((c) => c.text).join('\n\n'), question)), doc));
      }
      entities = mergeEntities(rules, nano);
      selection = await selectClausesBatched(chunks, question, (p) => run('minimize', p));
      const selected = chunks.filter((c) => selection.ids.includes(c.id));
      route = parseRouteResponse(await run('route', buildRoutePrompt(question, selected))) ?? { local: false, reason: 'Unclear, so it goes to the reasoning step.' };
    } catch (e) {
      if (!(e instanceof DeviceUnavailableError)) throw e;
      mode = 'basic';
      steps.length = 0;
      entities = rules;
      selection = { ids: chunks.map((c) => c.id), reason: 'Basic protection: every clause is included, masked.' };
      route = { local: false, reason: 'Basic protection: questions go to the reasoning step, masked.' };
    }
  }

  if (mode === 'basic') {
    flagged = flagNames(doc, rules);
    entities = mergeEntities(rules, flagged);
    steps.push({ step: 'detect', source: 'rules', ms: 0 });
  }

  const tags = assignTags(entities);
  const selected = chunks.filter((c) => selection.ids.includes(c.id));
  const outbound = [`Question: ${maskQuestion(question, entities, tags)}`, ...selected.map((c) => `${c.label}: ${maskChunk(c, entities, tags)}`)].join(
    '\n\n',
  );
  const guard = checkOutbound(outbound, entities);
  const receipt = buildReceipt({ entities, outbound, chunksSent: selected, chunksAll: chunks, steps: [...steps], mode });

  return {
    question,
    chunks,
    entities,
    tags,
    selectedIds: selection.ids,
    selectionReason: selection.reason,
    route,
    outbound,
    guard,
    receipt,
    mode,
    flaggedForReview: flagged,
    steps,
  };
}

export function buildReasonPrompt(approvedOutbound: string): string {
  return `## Instructions
Answer the user's question using only the excerpt. Start with a one-sentence verdict, then explain briefly.
Keep every tag in square brackets exactly as written. ${CLOUD_EXPRESSION_INSTRUCTION}
This explains a document; it is not legal advice.

## Excerpt
${approvedOutbound}`;
}

export async function answer(
  analysis: Analysis,
  approvedOutbound: string,
  deps: Deps,
): Promise<{ text: string; spans: RestoredSpan[]; source: 'on_device' | 'in_cloud'; lighter: boolean; receipt: Receipt }> {
  const check = checkOutbound(approvedOutbound, analysis.entities);
  if (!check.ok) throw new OutboundBlockedError(check.leaks);

  const selected = analysis.chunks.filter((c) => analysis.selectedIds.includes(c.id));
  const steps = [...analysis.steps];

  if (analysis.mode === 'private' && analysis.route.local) {
    const r = await deps.runPrivate(deps.models.answerLocal, buildLocalAnswerPrompt(analysis.question, selected), 'answerLocal');
    steps.push({ step: 'answerLocal', source: 'on_device', ms: r.ms });
    const receipt = buildReceipt({ entities: analysis.entities, outbound: null, chunksSent: [], chunksAll: analysis.chunks, steps, mode: analysis.mode });
    return { text: r.text, spans: [], source: 'on_device', lighter: false, receipt };
  }

  const prompt = buildReasonPrompt(approvedOutbound);
  const started = performance.now();
  const res = await deps.models.reason.generateContent(prompt);
  const ms = Math.round(performance.now() - started);
  const source = res.response.inferenceSource === InferenceSource.ON_DEVICE ? 'on_device' : 'in_cloud';
  networkLog.record({ at: Date.now(), step: 'reason', target: source === 'in_cloud' ? 'cloud' : 'device', blocked: false, payload: prompt });
  steps.push({ step: 'reason', source, ms });
  const restored = restoreAnswer(res.response.text(), analysis.tags);
  const receipt = buildReceipt({
    entities: analysis.entities,
    outbound: source === 'in_cloud' ? approvedOutbound : null,
    chunksSent: source === 'in_cloud' ? selected : [],
    chunksAll: analysis.chunks,
    steps,
    mode: analysis.mode,
  });
  return { text: restored.text, spans: restored.spans, source, lighter: source === 'on_device', receipt };
}
