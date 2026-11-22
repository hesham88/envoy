import { getGenerativeModel, InferenceMode, type AI, type GenerativeModel, type HybridParams } from 'firebase/ai';
import type { Step } from '@envoy/core';
import type { RemoteSettings } from './remote';

export { DEFAULT_SETTINGS } from './remote';

/** A plain JSON Schema object (the device takes it as responseConstraint, the cloud as responseJsonSchema). */
export type JsonSchema = Record<string, unknown>;

const ENGLISH_TEXT = [{ type: 'text' as const, languages: ['en'] }];

/** Short device-side system prompts. Task-specific instructions live in the per-call prompts from @envoy/core. */
export const SYSTEM_PROMPTS: Record<Step, string> = {
  detect: 'You find personal details in documents and label each with its role. Reply only with JSON that matches the schema.',
  minimize: 'You pick the fewest document clauses needed to answer a question. Reply only with JSON that matches the schema.',
  route: 'You decide whether a question can be answered directly from the given clauses. Reply only with JSON that matches the schema.',
  answerLocal: 'You answer short factual questions using only the given clauses. Be brief and exact. If the clauses do not say, reply that the document does not say.',
  reason: 'You explain contract clauses clearly and carefully. Identities are replaced by tags in square brackets; keep the tags exactly as written.',
};

/** Private steps never leave the device; only `reason` may use the cloud. */
export function modeFor(step: Step): InferenceMode {
  return step === 'reason' ? InferenceMode.PREFER_IN_CLOUD : InferenceMode.ONLY_ON_DEVICE;
}

/** One model instance per step, with its deliberate inference mode. */
export function createStepModel(ai: AI, step: Step, settings: RemoteSettings, schema?: JsonSchema): GenerativeModel {
  const params: HybridParams = {
    mode: modeFor(step),
    inCloudParams: {
      model: settings.cloudModel,
      ...(schema ? { generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema } } : {}),
    },
    onDeviceParams: {
      createOptions: {
        expectedInputs: ENGLISH_TEXT,
        expectedOutputs: ENGLISH_TEXT,
        initialPrompts: [{ role: 'system', content: [{ type: 'text', value: SYSTEM_PROMPTS[step] }] }],
      },
      ...(schema ? { promptOptions: { responseConstraint: schema } } : {}),
    },
  };
  return getGenerativeModel(ai, params);
}
