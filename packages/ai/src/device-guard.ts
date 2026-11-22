/**
 * Device guard: Envoy's own check around every private step.
 *
 * firebase-js-sdk issue #10635 (open): with ONLY_ON_DEVICE, a browser without Chrome's
 * `LanguageModel` API sends the request to the cloud instead of throwing. We never rely on
 * the SDK for this promise: we check the device first, block the cloud endpoint while a
 * private step runs, and reject any answer that did not come from the device.
 */
import { InferenceSource, type GenerativeModel } from 'firebase/ai';
import type { Step } from '@envoy/core';
import { networkLog } from './network-log';

export type DeviceStatus = 'no-api' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

const CLOUD_ENDPOINT = 'firebasevertexai.googleapis.com';
const ENGLISH_TEXT = [{ type: 'text', languages: ['en'] }];

export class DeviceUnavailableError extends Error {
  override name = 'DeviceUnavailableError';
  constructor(public readonly reason: Exclude<DeviceStatus, 'available'>) {
    super(`On-device model not ready (${reason}); Envoy uses Basic protection instead.`);
  }
}

export class PrivacyViolationError extends Error {
  override name = 'PrivacyViolationError';
}

interface LanguageModelSession {
  destroy?: () => void;
}

interface LanguageModelApi {
  availability(options: unknown): Promise<string>;
  create?: (options?: unknown) => Promise<LanguageModelSession>;
}

/**
 * Ensures any Chrome `LanguageModel` session created inside `fn` is destroyed as soon as `fn`
 * finishes. `@firebase/ai`'s `ChromeAdapterImpl` holds `this.oldSession` open on every
 * `GenerativeModel` instance; with 4 separate step models (`detect`, `minimize`, `route`,
 * `answerLocal`), keeping 4 concurrent KV caches open exhausts on-device memory on CPU.
 */
async function withSessionCleanup<T>(fn: () => Promise<T>): Promise<T> {
  if (!('LanguageModel' in globalThis)) return fn();
  const api = (globalThis as unknown as { LanguageModel: LanguageModelApi }).LanguageModel;
  if (typeof api.create !== 'function') return fn();
  const originalCreate = api.create.bind(api);
  const created: Array<{ session: LanguageModelSession; destroy: () => void }> = [];
  api.create = async (options?: unknown) => {
    const session = await originalCreate(options);
    if (session && typeof session.destroy === 'function') {
      const realDestroy = session.destroy.bind(session);
      let destroyed = false;
      const safeDestroy = () => {
        if (!destroyed) {
          destroyed = true;
          try {
            realDestroy();
          } catch {
            // ignore double-destroy errors
          }
        }
      };
      session.destroy = safeDestroy;
      created.push({ session, destroy: safeDestroy });
    }
    return session;
  };
  try {
    return await fn();
  } finally {
    api.create = originalCreate;
    for (const item of created) item.destroy();
  }
}

export async function getDeviceStatus(): Promise<DeviceStatus> {
  if (!('LanguageModel' in globalThis)) return 'no-api';
  const api = (globalThis as unknown as { LanguageModel: LanguageModelApi }).LanguageModel;
  try {
    const status = await api.availability({ expectedInputs: ENGLISH_TEXT, expectedOutputs: ENGLISH_TEXT });
    return status === 'available' || status === 'downloadable' || status === 'downloading' ? status : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function assertDeviceReady(): Promise<void> {
  const status = await getDeviceStatus();
  if (status !== 'available') throw new DeviceUnavailableError(status);
}

let tripwireDepth = 0;
let originalFetch: typeof fetch | undefined;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** While `fn` runs, any request to the AI Logic cloud endpoint is refused and logged. */
export async function withCloudTripwire<T>(fn: () => Promise<T>): Promise<T> {
  if (tripwireDepth === 0) {
    originalFetch = globalThis.fetch;
    const passThrough = originalFetch;
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.includes(CLOUD_ENDPOINT)) {
        const payload = typeof init?.body === 'string' ? init.body : '';
        networkLog.record({ at: Date.now(), step: 'tripwire', target: 'cloud', blocked: true, payload });
        return Promise.reject(new PrivacyViolationError('Blocked a cloud request during a private step.'));
      }
      return passThrough(input, init);
    };
  }
  tripwireDepth++;
  try {
    return await fn();
  } finally {
    tripwireDepth--;
    if (tripwireDepth === 0 && originalFetch) {
      globalThis.fetch = originalFetch;
      originalFetch = undefined;
    }
  }
}

/** Runs one private step on the device, or not at all. */
export async function runPrivate(
  model: GenerativeModel,
  request: string,
  step: Step,
): Promise<{ text: string; ms: number; source: 'on_device' }> {
  await assertDeviceReady();
  const started = performance.now();
  const result = await withCloudTripwire(() => withSessionCleanup(() => model.generateContent(request)));
  const ms = Math.round(performance.now() - started);
  if (result.response.inferenceSource !== InferenceSource.ON_DEVICE) {
    networkLog.record({ at: Date.now(), step, target: 'cloud', blocked: true, payload: '' });
    throw new PrivacyViolationError(`Step "${step}" did not run on the device; its result was discarded.`);
  }
  networkLog.record({ at: Date.now(), step, target: 'device', blocked: false, payload: request });
  return { text: result.response.text(), ms, source: 'on_device' };
}
