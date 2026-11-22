import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InferenceSource, type GenerativeModel } from 'firebase/ai';
import {
  assertDeviceReady,
  DeviceUnavailableError,
  getDeviceStatus,
  PrivacyViolationError,
  runPrivate,
  withCloudTripwire,
} from './device-guard';
import { networkLog } from './network-log';

const CLOUD = 'https://firebasevertexai.googleapis.com/v1beta/projects/x:generateContent';

function stubLanguageModel(status: string) {
  vi.stubGlobal('LanguageModel', { availability: vi.fn(async () => status) });
}

function fakeModel(source: string, text = 'ok') {
  const generateContent = vi.fn(async () => ({ response: { text: () => text, inferenceSource: source } }));
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
    const lm = (globalThis as unknown as { LanguageModel: { availability: ReturnType<typeof vi.fn> } }).LanguageModel;
    expect(lm.availability).toHaveBeenCalledWith({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
  });

  it("treats an availability() crash as 'unavailable'", async () => {
    vi.stubGlobal('LanguageModel', { availability: vi.fn(async () => { throw new Error('boom'); }) });
    await expect(getDeviceStatus()).resolves.toBe('unavailable');
  });
});

describe('assertDeviceReady', () => {
  it('throws DeviceUnavailableError with the reason when the API is missing', async () => {
    await expect(assertDeviceReady()).rejects.toMatchObject({ name: 'DeviceUnavailableError', reason: 'no-api' });
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
    await expect(runPrivate(model, 'secret text', 'detect')).rejects.toBeInstanceOf(DeviceUnavailableError);
    stubLanguageModel('unavailable');
    await expect(runPrivate(model, 'secret text', 'detect')).rejects.toBeInstanceOf(DeviceUnavailableError);
    expect(generateContent).toHaveBeenCalledTimes(0);
  });

  it('rejects an answer that did not come from the device', async () => {
    stubLanguageModel('available');
    const { model } = fakeModel(InferenceSource.IN_CLOUD);
    await expect(runPrivate(model, 'secret text', 'detect')).rejects.toBeInstanceOf(PrivacyViolationError);
  });

  it('returns the text, timing and source when it ran on the device', async () => {
    stubLanguageModel('available');
    const { model } = fakeModel(InferenceSource.ON_DEVICE, '{"ok":true}');
    const out = await runPrivate(model, 'prompt', 'route');
    expect(out.text).toBe('{"ok":true}');
    expect(out.source).toBe('on_device');
    expect(out.ms).toBeGreaterThanOrEqual(0);
    expect(networkLog.entries.at(-1)).toMatchObject({ step: 'route', target: 'device', blocked: false });
  });

  it('blocks a cloud request the SDK makes during a private step', async () => {
    stubLanguageModel('available');
    const sneaky = {
      generateContent: vi.fn(async () => {
        await fetch(CLOUD, { method: 'POST', body: 'raw document' });
        return { response: { text: () => 'x', inferenceSource: InferenceSource.ON_DEVICE } };
      }),
    } as unknown as GenerativeModel;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    await expect(runPrivate(sneaky, 'raw document', 'detect')).rejects.toBeInstanceOf(PrivacyViolationError);
    expect(networkLog.entries.some((e) => e.step === 'tripwire' && e.blocked)).toBe(true);
  });
});

describe('withCloudTripwire', () => {
  it('rejects requests to the AI Logic endpoint and records them', async () => {
    const real = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', real);
    await expect(withCloudTripwire(() => fetch(CLOUD))).rejects.toBeInstanceOf(PrivacyViolationError);
    expect(real).not.toHaveBeenCalled();
    expect(networkLog.entries.at(-1)).toMatchObject({ step: 'tripwire', target: 'cloud', blocked: true });
  });

  it('lets other requests through', async () => {
    const real = vi.fn(async () => new Response('fine'));
    vi.stubGlobal('fetch', real);
    const res = await withCloudTripwire(() => fetch('https://content-firebaseappcheck.googleapis.com/token'));
    expect(await res.text()).toBe('fine');
  });

  it('restores the original fetch even when the wrapped work throws', async () => {
    const real = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', real);
    await expect(withCloudTripwire(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
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
