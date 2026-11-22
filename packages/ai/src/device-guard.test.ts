import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InferenceSource, type GenerativeModel } from 'firebase/ai';
import {
  assertDeviceReady,
  DeviceUnavailableError,
  getDeviceStatus,
  PrivacyViolationError,
  cancelPrivateSteps,
  inAiQueue,
  PrivateStepCancelledError,
  runPrivate,
  withCloudTripwire,
} from './device-guard';
import { networkLog } from './network-log';

const CLOUD = 'https://firebasevertexai.googleapis.com/v1beta/projects/x:generateContent';

function stubLanguageModel(status: string) {
  vi.stubGlobal('LanguageModel', { availability: vi.fn(async () => status) });
}

function fakeModel(source: string, text = 'ok') {
  const generateContent = vi.fn(async () => ({
    response: { text: () => text, inferenceSource: source },
  }));
  return { model: { generateContent } as unknown as GenerativeModel, generateContent };
}

beforeEach(() => networkLog.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getDeviceStatus', () => {
  it("reports 'no-api' when the browser has no LanguageModel (Safari, Firefox, disabled flag)", async () => {
    expect('LanguageModel' in globalThis).toBe(false);
    await expect(getDeviceStatus()).resolves.toBe('no-api');
  });

  it('passes through what Chrome reports', async () => {
    stubLanguageModel('downloadable');
    await expect(getDeviceStatus()).resolves.toBe('downloadable');
    stubLanguageModel('available');
    await expect(getDeviceStatus()).resolves.toBe('available');
  });

  it('asks about English text in and out, the same options the models use', async () => {
    stubLanguageModel('available');
    await getDeviceStatus();
    const lm = (
      globalThis as unknown as { LanguageModel: { availability: ReturnType<typeof vi.fn> } }
    ).LanguageModel;
    expect(lm.availability).toHaveBeenCalledWith({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
  });

  it("treats an availability() crash as 'unavailable'", async () => {
    vi.stubGlobal('LanguageModel', {
      availability: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    await expect(getDeviceStatus()).resolves.toBe('unavailable');
  });
});

describe('assertDeviceReady', () => {
  it('throws DeviceUnavailableError with the reason when the API is missing', async () => {
    await expect(assertDeviceReady()).rejects.toMatchObject({
      name: 'DeviceUnavailableError',
      reason: 'no-api',
    });
  });

  it('throws while the model is still downloading', async () => {
    stubLanguageModel('downloading');
    await expect(assertDeviceReady()).rejects.toBeInstanceOf(DeviceUnavailableError);
  });

  it('passes when the model is available', async () => {
    stubLanguageModel('available');
    await expect(assertDeviceReady()).resolves.toBeUndefined();
  });
});

describe('runPrivate', () => {
  it('never calls the model when the device is not ready (blocks SDK bug #10635)', async () => {
    const { model, generateContent } = fakeModel(InferenceSource.ON_DEVICE);
    await expect(runPrivate(model, 'secret text', 'detect')).rejects.toBeInstanceOf(
      DeviceUnavailableError,
    );
    stubLanguageModel('unavailable');
    await expect(runPrivate(model, 'secret text', 'detect')).rejects.toBeInstanceOf(
      DeviceUnavailableError,
    );
    expect(generateContent).toHaveBeenCalledTimes(0);
  });

  it('rejects an answer that did not come from the device', async () => {
    stubLanguageModel('available');
    const { model } = fakeModel(InferenceSource.IN_CLOUD);
    await expect(runPrivate(model, 'secret text', 'detect')).rejects.toBeInstanceOf(
      PrivacyViolationError,
    );
  });

  it('returns the text, timing and source when it ran on the device', async () => {
    stubLanguageModel('available');
    const { model } = fakeModel(InferenceSource.ON_DEVICE, '{"ok":true}');
    const out = await runPrivate(model, 'prompt', 'route');
    expect(out.text).toBe('{"ok":true}');
    expect(out.source).toBe('on_device');
    expect(out.ms).toBeGreaterThanOrEqual(0);
    expect(networkLog.entries.at(-1)).toMatchObject({
      step: 'route',
      target: 'device',
      blocked: false,
    });
  });

  it('blocks a cloud request the SDK makes during a private step', async () => {
    stubLanguageModel('available');
    const sneaky = {
      generateContent: vi.fn(async () => {
        await fetch(CLOUD, { method: 'POST', body: 'raw document' });
        return { response: { text: () => 'x', inferenceSource: InferenceSource.ON_DEVICE } };
      }),
    } as unknown as GenerativeModel;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}')),
    );
    await expect(runPrivate(sneaky, 'raw document', 'detect')).rejects.toBeInstanceOf(
      PrivacyViolationError,
    );
    expect(networkLog.entries.some((e) => e.step === 'tripwire' && e.blocked)).toBe(true);
  });

  it('destroys any Chrome LanguageModel session created during generateContent to prevent KV-cache leaks', async () => {
    const destroy = vi.fn();
    const create = vi.fn(async () => ({ destroy }));
    vi.stubGlobal('LanguageModel', { availability: vi.fn(async () => 'available'), create });
    const model = {
      generateContent: vi.fn(async () => {
        const lm = (
          globalThis as unknown as {
            LanguageModel: { create: () => Promise<{ destroy: () => void }> };
          }
        ).LanguageModel;
        await lm.create();
        return { response: { text: () => 'ok', inferenceSource: InferenceSource.ON_DEVICE } };
      }),
    } as unknown as GenerativeModel;
    await runPrivate(model, 'prompt', 'route');
    expect(create).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe('withCloudTripwire', () => {
  it('rejects requests to the AI Logic endpoint and records them', async () => {
    const real = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', real);
    await expect(withCloudTripwire(() => fetch(CLOUD))).rejects.toBeInstanceOf(
      PrivacyViolationError,
    );
    expect(real).not.toHaveBeenCalled();
    expect(networkLog.entries.at(-1)).toMatchObject({
      step: 'tripwire',
      target: 'cloud',
      blocked: true,
    });
  });

  it('lets other requests through', async () => {
    const real = vi.fn(async () => new Response('fine'));
    vi.stubGlobal('fetch', real);
    const res = await withCloudTripwire(() =>
      fetch('https://content-firebaseappcheck.googleapis.com/token'),
    );
    expect(await res.text()).toBe('fine');
  });

  it('restores the original fetch even when the wrapped work throws', async () => {
    const real = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', real);
    await expect(
      withCloudTripwire(async () => {
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    expect(globalThis.fetch).toBe(real);
  });

  it('stays installed until the last overlapping private step finishes', async () => {
    const real = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', real);
    let release!: () => void;
    const first = withCloudTripwire(() => new Promise<void>((r) => (release = r)));
    await withCloudTripwire(async () => undefined);
    await expect(fetch(CLOUD)).rejects.toBeInstanceOf(PrivacyViolationError);
    release();
    await first;
    expect(globalThis.fetch).toBe(real);
  });
});

describe('one queue for every model call', () => {
  it('never runs two private steps at once, and a cloud call waits for the private step', async () => {
    stubLanguageModel('available');
    let running = 0;
    let most = 0;
    const order: string[] = [];
    const slow = (name: string, source: string) =>
      ({
        generateContent: vi.fn(async () => {
          running++;
          most = Math.max(most, running);
          order.push(`start ${name}`);
          await new Promise((r) => setTimeout(r, 30));
          order.push(`end ${name}`);
          running--;
          return { response: { text: () => name, inferenceSource: source } };
        }),
      }) as unknown as GenerativeModel;
    const cloudFetch = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', cloudFetch);

    const a = runPrivate(slow('detect', InferenceSource.ON_DEVICE), 'p', 'detect');
    const b = runPrivate(slow('minimize', InferenceSource.ON_DEVICE), 'p', 'minimize');
    // A cloud call queued while private steps are pending: it must not meet the tripwire.
    const cloud = inAiQueue(() => fetch(CLOUD).then(() => 'cloud'));
    await expect(Promise.all([a, b, cloud])).resolves.toHaveLength(3);
    expect(most).toBe(1);
    expect(order).toEqual(['start detect', 'end detect', 'start minimize', 'end minimize']);
    expect(cloudFetch).toHaveBeenCalledTimes(1);
    expect(networkLog.entries.filter((e) => e.blocked)).toEqual([]);
  });

  it('a failed step does not jam the queue', async () => {
    stubLanguageModel('available');
    const bad = {
      generateContent: vi.fn(async () => {
        throw new Error('model crashed');
      }),
    } as unknown as GenerativeModel;
    await expect(runPrivate(bad, 'p', 'detect')).rejects.toThrow('model crashed');
    const { model } = fakeModel(InferenceSource.ON_DEVICE, 'fine');
    await expect(runPrivate(model, 'p', 'route')).resolves.toMatchObject({ text: 'fine' });
  });
});

describe('cancelPrivateSteps', () => {
  it('stops the running on-device step by destroying its session', async () => {
    let destroyed = false;
    let rejectPrompt: (e: Error) => void = () => undefined;
    vi.stubGlobal('LanguageModel', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({
        destroy: () => {
          destroyed = true;
          rejectPrompt(new Error('AbortError'));
        },
      })),
    });
    const model = {
      generateContent: vi.fn(async () => {
        await (
          globalThis as unknown as { LanguageModel: { create: () => Promise<unknown> } }
        ).LanguageModel.create();
        return new Promise((_, reject) => {
          rejectPrompt = reject;
        });
      }),
    } as unknown as GenerativeModel;
    const step = runPrivate(model, 'p', 'detect');
    await new Promise((r) => setTimeout(r, 10));
    cancelPrivateSteps();
    await expect(step).rejects.toBeInstanceOf(PrivateStepCancelledError);
    expect(destroyed).toBe(true);
  });
});
