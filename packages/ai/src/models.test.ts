import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InferenceMode, type AI } from 'firebase/ai';

const getGenerativeModel = vi.fn((_ai: unknown, params: unknown) => ({ params }));
vi.mock('firebase/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/ai')>();
  return {
    ...actual,
    getGenerativeModel: (ai: unknown, params: unknown) => getGenerativeModel(ai, params),
  };
});

const { createStepModel, modeFor, DEFAULT_SETTINGS } = await import('./models');

const ai = {} as AI;
const settings = { ...DEFAULT_SETTINGS };

describe('modeFor', () => {
  it('pins every private step to ONLY_ON_DEVICE', () => {
    for (const step of ['detect', 'minimize', 'route', 'answerLocal'] as const) {
      expect(modeFor(step)).toBe(InferenceMode.ONLY_ON_DEVICE);
    }
  });

  it('lets the reason step prefer the cloud', () => {
    expect(modeFor('reason')).toBe(InferenceMode.PREFER_IN_CLOUD);
  });
});

describe('createStepModel', () => {
  beforeEach(() => getGenerativeModel.mockClear());

  it('always names the cloud model (the SDK throws NO_MODEL otherwise)', () => {
    for (const step of ['detect', 'minimize', 'route', 'answerLocal', 'reason'] as const) {
      createStepModel(ai, step, settings);
      const params = getGenerativeModel.mock.lastCall?.[1] as { inCloudParams: { model: string } };
      expect(params.inCloudParams.model).toBe(settings.cloudModel);
    }
  });

  it('puts the on-device system prompt in initialPrompts as text content', () => {
    createStepModel(ai, 'detect', settings);
    const params = getGenerativeModel.mock.lastCall?.[1] as {
      onDeviceParams: {
        createOptions: {
          initialPrompts: { role: string; content: { type: string; value: string }[] }[];
        };
      };
    };
    const first = params.onDeviceParams.createOptions.initialPrompts[0];
    expect(first?.role).toBe('system');
    expect(first?.content[0]?.type).toBe('text');
    expect(typeof first?.content[0]?.value).toBe('string');
  });

  it('declares English text in and out', () => {
    createStepModel(ai, 'route', settings);
    const params = getGenerativeModel.mock.lastCall?.[1] as {
      onDeviceParams: { createOptions: { expectedInputs: unknown; expectedOutputs: unknown } };
    };
    expect(params.onDeviceParams.createOptions.expectedInputs).toEqual([
      { type: 'text', languages: ['en'] },
    ]);
    expect(params.onDeviceParams.createOptions.expectedOutputs).toEqual([
      { type: 'text', languages: ['en'] },
    ]);
  });

  it('sets structured output on both sides only when a schema is given', () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
    createStepModel(ai, 'route', settings, schema);
    const withSchema = getGenerativeModel.mock.lastCall?.[1] as {
      onDeviceParams: { promptOptions?: { responseConstraint: unknown } };
      inCloudParams: {
        generationConfig?: { responseMimeType: string; responseJsonSchema: unknown };
      };
    };
    expect(withSchema.onDeviceParams.promptOptions?.responseConstraint).toEqual(schema);
    expect(withSchema.inCloudParams.generationConfig?.responseMimeType).toBe('application/json');
    expect(withSchema.inCloudParams.generationConfig?.responseJsonSchema).toEqual(schema);

    createStepModel(ai, 'route', settings);
    const without = getGenerativeModel.mock.lastCall?.[1] as {
      onDeviceParams: { promptOptions?: unknown };
      inCloudParams: { generationConfig?: unknown };
    };
    expect(without.onDeviceParams.promptOptions).toBeUndefined();
    expect(without.inCloudParams.generationConfig).toBeUndefined();
  });

  it('uses the remote cloud model when settings change', () => {
    createStepModel(ai, 'reason', { ...settings, cloudModel: 'gemini-3.5-flash-lite' });
    const params = getGenerativeModel.mock.lastCall?.[1] as {
      mode: string;
      inCloudParams: { model: string };
    };
    expect(params.mode).toBe(InferenceMode.PREFER_IN_CLOUD);
    expect(params.inCloudParams.model).toBe('gemini-3.5-flash-lite');
  });
});
