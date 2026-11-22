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
  splitChunk,
  type Chunk,
  type CustomRule,
  type Entity,
  type Leak,
  type Receipt,
  type ReceiptStep,
  type RestoredSpan,
  type Step,
  type TagMap,
} from '@envoy/core';
import { PrivacyViolationError, type DeviceStatus, type runPrivate as RunPrivate } from './device-guard';
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
  /** Why a run that wanted private mode fell back to Basic protection, if it did. */
  fallbackReason: string | null;
  /** The user's own rules this run used (kept so re-composing and the guard apply them too). */
  customRules?: readonly CustomRule[];
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
  const overhead = estimateTokens(build([]));
  const maxChars = Math.max(200, (maxTokens - overhead - 64) * 4);
  const fitted = chunks.flatMap((c) => splitChunk(c, maxChars));
  const batches: Chunk[][] = [];
  let current: Chunk[] = [];
  for (const c of fitted) {
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
  'the this that these those either each any both all residential lease agreement landlord tenant premises arab republic egypt cairo maadi road street clause clauses rent deposit utilities maintenance payment entry termination notices governing signed building flat use parties term contract notice page january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday'.split(
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

function flagNames(text: string, taken: Entity[]): Entity[] {
  const out: Entity[] = [];
  for (const [i, re] of NAME_PATTERNS.entries()) {
    for (const m of text.matchAll(re)) {
      const words = m[0].split(/\s+/).filter((w) => !/^(Mr|Mrs|Ms|Miss|Dr|Prof|Eng)\.?$/.test(w));
      if (i > 0 && words.some((w) => NAME_STOPWORDS.has(w.toLowerCase()))) continue;
      const e: Entity = { type: 'PERSON', value: m[0], start: m.index, end: m.index + m[0].length, confidence: 0.4, source: 'rules' };
      if (![...taken, ...out].some((t) => t.start < e.end && e.start < t.end)) out.push(e);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function maskChunk(c: Chunk, entities: Entity[], tags: TagMap): string {
  const inside = entities
    .filter((e) => e.start >= c.start && e.end <= c.end)
    .map((e) => ({ ...e, start: e.start - c.start, end: e.end - c.start }));
  return maskText(c.text, inside, tags);
}

function maskQuestion(question: string, docEntities: Entity[], tags: TagMap, custom?: readonly CustomRule[]): string {
  const found = detectWithRules(question, { custom });
  for (const e of docEntities) {
    for (let i = question.indexOf(e.value); i !== -1; i = question.indexOf(e.value, i + e.value.length)) {
      if (!found.some((f) => f.start < i + e.value.length && i < f.end)) found.push({ ...e, start: i, end: i + e.value.length });
    }
  }
  return maskText(question, found, tags);
}

export interface ReviewChoices {
  selectedIds: number[];
  /** Tags whose whole sentence the user removed from the excerpt. */
  hiddenTags: Set<string>;
  /** Tags whose real value the user chose to share. */
  sharedTags: Set<string>;
}

type ComposeInput = Pick<Analysis, 'question' | 'chunks' | 'entities' | 'tags' | 'steps' | 'mode' | 'customRules'>;

/** Replaces every sentence that mentions a hidden tag with "[…]". */
function dropHiddenSentences(text: string, hidden: Set<string>): string {
  if (![...hidden].some((t) => text.includes(t))) return text;
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const hide = [...hidden].some((t) => sentence.includes(t));
    if (!hide) out.push(sentence);
    else if (out.at(-1) !== '[…]') out.push('[…]');
  }
  return out.join(' ');
}

/** Rebuilds the excerpt, guard result and receipt from the user's review choices. Pure. */
export function composeOutbound(a: ComposeInput, choices: ReviewChoices): { outbound: string; guard: { ok: boolean; leaks: Leak[] }; receipt: Receipt } {
  const isShared = (e: Entity) => choices.sharedTags.has(a.tags.tagOf(e));
  const masked = a.entities.filter((e) => !isShared(e));
  const allowed = a.entities.filter(isShared);
  const selected = a.chunks.filter((c) => choices.selectedIds.includes(c.id));
  const outbound = [
    `Question: ${maskQuestion(a.question, masked, a.tags, a.customRules)}`,
    ...selected.map((c) => `${c.label}: ${dropHiddenSentences(maskChunk(c, masked, a.tags), choices.hiddenTags)}`),
  ].join('\n\n');
  const knownTags = a.tags.entries().map((t) => t.tag);
  const guard = checkOutbound(outbound, a.entities, { knownTags, allowed, custom: a.customRules });
  const sharedByUser = knownTags.filter((t) => choices.sharedTags.has(t)).length;
  const receipt = buildReceipt({ entities: a.entities, outbound, chunksSent: selected, chunksAll: a.chunks, steps: [...a.steps], mode: a.mode, sharedByUser });
  return { outbound, guard, receipt };
}

export interface AnalyzeProgress {
  step: 'rules' | Step;
  /** 1-based part of this step (on-device steps can run in several batches). */
  part: number;
  parts: number;
}

export async function analyze(
  doc: string,
  question: string,
  deps: Deps,
  opts: { onProgress?: (p: AnalyzeProgress) => void; detectScope?: 'all' | 'selected'; customRules?: readonly CustomRule[] } = {},
): Promise<Analysis> {
  const progress = opts.onProgress ?? (() => undefined);
  const detectScope = opts.detectScope ?? 'all';
  progress({ step: 'rules', part: 1, parts: 1 });
  const chunks = chunkDocument(doc);
  const customRules = opts.customRules?.length ? opts.customRules : undefined;
  const rules = detectWithRules(doc, { custom: customRules });
  const steps: ReceiptStep[] = [];
  let mode: 'private' | 'basic' = (await deps.getDeviceStatus()) === 'available' ? 'private' : 'basic';
  let entities = rules;
  let flagged: Entity[] = [];
  let selection = { ids: chunks.map((c) => c.id), reason: 'Basic protection: every clause is included, masked.' };
  let route = { local: false, reason: 'Basic protection: questions go to the reasoning step, masked.' };

  let fallbackReason: string | null = null;
  if (mode === 'private') {
    const blockedBefore = networkLog.entries.filter((x) => x.blocked).length;
    try {
      const totals: Partial<Record<Step, number>> = {
        detect: batchChunks(chunks, (b) => buildDetectPrompt(b.map((c) => c.text).join('\n\n'), question), MAX_TOKENS).length,
        minimize: batchChunks(chunks, (b) => buildMinimizePrompt(b, question), MAX_TOKENS).length,
        route: 1,
      };
      const done: Partial<Record<Step, number>> = {};
      const run = async (step: Step, prompt: string) => {
        done[step] = (done[step] ?? 0) + 1;
        progress({ step, part: done[step]!, parts: Math.max(totals[step] ?? 1, done[step]!) });
        const r = await deps.runPrivate(deps.models[step], prompt, step);
        const prev = steps.find((s) => s.step === step);
        if (prev) prev.ms += r.ms;
        else steps.push({ step, source: 'on_device', ms: r.ms });
        return r.text;
      };

      const nano: Entity[] = [];
      if (detectScope === 'selected') {
        selection = await selectClausesBatched(chunks, question, (p) => run('minimize', p));
        const selected = chunks.filter((c) => selection.ids.includes(c.id));
        const detectChunks = chunks.filter((c) => selection.ids.includes(c.id) || c.id === 1);
        const detectBatches = batchChunks(detectChunks, (b) => buildDetectPrompt(b.map((c) => c.text).join('\n\n'), question), MAX_TOKENS);
        totals.detect = detectBatches.length;
        for (const batch of detectBatches) {
          nano.push(...parseDetectResponse(await run('detect', buildDetectPrompt(batch.map((c) => c.text).join('\n\n'), question)), doc));
        }
        const merged = mergeEntities(rules, nano);
        const unselectedNames = flagNames(doc, merged);
        entities = mergeEntities(merged, unselectedNames);
        const routePrompt = buildRoutePrompt(question, selected);
        route =
          estimateTokens(routePrompt) > MAX_TOKENS
            ? { local: false, reason: 'Too much text for an on-device check, so it goes to the reasoning step, masked.' }
            : (parseRouteResponse(await run('route', routePrompt)) ?? { local: false, reason: 'Unclear, so it goes to the reasoning step.' });
      } else {
        const detectBatches = batchChunks(chunks, (b) => buildDetectPrompt(b.map((c) => c.text).join('\n\n'), question), MAX_TOKENS);
        for (const batch of detectBatches) {
          nano.push(...parseDetectResponse(await run('detect', buildDetectPrompt(batch.map((c) => c.text).join('\n\n'), question)), doc));
        }
        entities = mergeEntities(rules, nano);
        selection = await selectClausesBatched(chunks, question, (p) => run('minimize', p));
        const selected = chunks.filter((c) => selection.ids.includes(c.id));
        const routePrompt = buildRoutePrompt(question, selected);
        route =
          estimateTokens(routePrompt) > MAX_TOKENS
            ? { local: false, reason: 'Too much text for an on-device check, so it goes to the reasoning step, masked.' }
            : (parseRouteResponse(await run('route', routePrompt)) ?? { local: false, reason: 'Unclear, so it goes to the reasoning step.' });
      }
    } catch (e) {
      // A blocked cloud request is fatal however the SDK wraps the error (it rewraps fetch failures).
      const blockedNow = networkLog.entries.filter((x) => x.blocked).length;
      if (e instanceof PrivacyViolationError || blockedNow > blockedBefore) {
        throw new PrivacyViolationError('A private step tried to reach the cloud. Nothing was sent; the analysis stopped.');
      }
      fallbackReason = `The on-device model stopped (${(e as Error).message}), so this run uses Basic protection.`;
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
  const { outbound, guard, receipt } = composeOutbound(
    { question, chunks, entities, tags, steps, mode, customRules },
    { selectedIds: selection.ids, hiddenTags: new Set(), sharedTags: new Set() },
  );

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
    fallbackReason,
    ...(customRules ? { customRules } : {}),
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
  opts: { sharedTags?: string[] } = {},
): Promise<{ text: string; spans: RestoredSpan[]; source: 'on_device' | 'in_cloud'; lighter: boolean; receipt: Receipt }> {
  const shared = new Set(opts.sharedTags ?? []);
  const allowed = analysis.entities.filter((e) => shared.has(analysis.tags.tagOf(e)));
  const knownTags = analysis.tags.entries().map((t) => t.tag);
  const sharedByUser = knownTags.filter((t) => shared.has(t)).length;
  const check = checkOutbound(approvedOutbound, analysis.entities, { knownTags, allowed, custom: analysis.customRules });
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
    sharedByUser: source === 'in_cloud' ? sharedByUser : 0,
  });
  return { text: restored.text, spans: restored.spans, source, lighter: source === 'on_device', receipt };
}
