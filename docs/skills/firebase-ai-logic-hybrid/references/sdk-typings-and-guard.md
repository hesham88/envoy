# `@firebase/ai` (`firebase@13.4.0`) Verified Type Signatures & Device Guard Reference

Source: Verified against `node_modules/@firebase/ai/dist/ai-public.d.ts` (`@firebase/ai@3.1.0` in `firebase@13.4.0`) and <https://developer.chrome.com/docs/ai/firebase-ai-logic>.

---

## 1. Key `@firebase/ai` TypeScript Signatures

```ts
// Backends
export declare class GoogleAIBackend extends Backend {
  constructor();
}
export declare class AgentPlatformBackend extends Backend {
  readonly location: string;
  constructor(location?: string); // defaults to 'global'
}

// Initialization
export declare interface AIOptions {
  backend?: Backend; // Defaults to GoogleAIBackend
  useLimitedUseAppCheckTokens?: boolean; // Defaults to false; set true for stronger App Check security
}
export declare function getAI(app?: FirebaseApp, options?: AIOptions): AI;
export declare function getGenerativeModel(
  ai: AI,
  modelParams: ModelParams | HybridParams,
  requestOptions?: RequestOptions
): GenerativeModel;

// Hybrid modes & inference source
export declare const InferenceMode: {
  readonly PREFER_ON_DEVICE: 'prefer_on_device';
  readonly ONLY_ON_DEVICE: 'only_on_device';
  readonly ONLY_IN_CLOUD: 'only_in_cloud';
  readonly PREFER_IN_CLOUD: 'prefer_in_cloud';
};
export declare const InferenceSource: {
  readonly ON_DEVICE: 'on_device';
  readonly IN_CLOUD: 'in_cloud';
};

// Hybrid configuration
export declare interface HybridParams {
  mode: InferenceMode;
  onDeviceParams?: OnDeviceParams;
  inCloudParams?: ModelParams;
}

export declare interface OnDeviceParams {
  createOptions?: LanguageModelCreateOptions;
  promptOptions?: LanguageModelPromptOptions;
}

export declare interface LanguageModelCreateOptions {
  /** Defaults to image input and English text input if not overridden. */
  expectedInputs?: { type: 'text' | 'image' | 'audio'; languages?: string[] }[];
  /** Defaults to English text output if not overridden. */
  expectedOutputs?: { type: 'text' | 'image' | 'audio'; languages?: string[] }[];
  monitor?: (monitor: {
    addEventListener(type: 'downloadprogress', listener: (e: { loaded: number }) => void): void;
  }) => void;
  signal?: AbortSignal;
  initialPrompts?: {
    role: 'system' | 'user' | 'assistant';
    content: { type: 'text' | 'image' | 'audio'; value: string | ImageBitmapSource | AudioBuffer | BufferSource }[];
  }[];
}

export declare interface LanguageModelPromptOptions {
  responseConstraint?: object;
}

export declare interface GenerationConfig {
  candidateCount?: number;
  stopSequences?: string[];
  maxOutputTokens?: number;
  /** @deprecated Not supported in Gemini 3.x and later models. Omit and let the model manage sampling. */
  temperature?: number;
  responseMimeType?: string;
  responseSchema?: TypedSchema;
  /** Raw JSON Schema object for cloud structured output. */
  responseJsonSchema?: { [key: string]: unknown };
  responseModalities?: ResponseModality[];
  thinkingConfig?: ThinkingConfig;
}
```

> **Note on Gemini 3.x+ Sampling Parameters (`ai-public.d.ts:951`):**
> In `@firebase/ai@3.1.0`, `temperature`, `topP`, `topK`, `presencePenalty`, and `frequencyPenalty` are marked `@deprecated Not supported in Gemini 3.x and later models` (and `presencePenalty`/`frequencyPenalty` will fail with HTTP 400 on Gemini 3.x+). Omit them on cloud `GenerationConfig` for `gemini-3.8-flash` and `gemini-3.5-flash-lite`.

---

## 2. Reference Implementation: 4-Layer Device Guard (`packages/ai/src/device-guard.ts`)

```ts
import { InferenceSource, type GenerativeModel } from 'firebase/ai';

export type DeviceStatus = 'no-api' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

const CLOUD_ENDPOINT = 'firebasevertexai.googleapis.com';
const ENGLISH_TEXT = [{ type: 'text', languages: ['en'] }];

export class DeviceUnavailableError extends Error {
  override name = 'DeviceUnavailableError';
  constructor(public readonly reason: Exclude<DeviceStatus, 'available'>) {
    super(`On-device model not ready (${reason}); switching to Basic protection.`);
  }
}

export class PrivacyViolationError extends Error {
  override name = 'PrivacyViolationError';
}

export async function getDeviceStatus(): Promise<DeviceStatus> {
  if (!('LanguageModel' in globalThis)) return 'no-api';
  const api = (globalThis as unknown as { LanguageModel: { availability(o: unknown): Promise<string> } }).LanguageModel;
  try {
    const s = await api.availability({ expectedInputs: ENGLISH_TEXT, expectedOutputs: ENGLISH_TEXT });
    return s === 'available' || s === 'downloadable' || s === 'downloading' ? s : 'unavailable';
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

export async function withCloudTripwire<T>(fn: () => Promise<T>): Promise<T> {
  if (tripwireDepth === 0) {
    originalFetch = globalThis.fetch;
    const passThrough = originalFetch;
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes(CLOUD_ENDPOINT)) {
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

export async function runPrivate(model: GenerativeModel, request: string): Promise<{ text: string; ms: number; source: 'on_device' }> {
  await assertDeviceReady();
  const started = performance.now();
  const result = await withCloudTripwire(() => model.generateContent(request));
  const ms = Math.round(performance.now() - started);
  if (result.response.inferenceSource !== InferenceSource.ON_DEVICE) {
    throw new PrivacyViolationError('Private step did not run on-device; result discarded.');
  }
  return { text: result.response.text(), ms, source: 'on_device' };
}
```

---

## 3. On-Device vs. Cloud Feature Compatibility Matrix in `firebase/ai`

| Feature | `IN_CLOUD` (`GoogleAIBackend`) | `ON_DEVICE` (`ChromeAdapter` / `LanguageModel`) |
| --- | --- | --- |
| `generateContent` / `generateContentStream` | Supported | Supported (creates a new Chrome session per call) |
| Multimodal images (`inlineData`: PNG/JPEG) | Supported | Supported (only if `expectedInputs` includes `type: 'image'`) |
| Multimodal PDF / Video / File URLs | Supported | **Not supported** (`AIErrorCode.UNSUPPORTED`) |
| `startChat` (multi-turn `ChatSession`) | Supported | **Not supported** |
| Function calling / `tools` / Grounding | Supported | **Not supported** |
| `countTokens` | Supported | **Not supported** (estimate ~4 chars/token or use native `session.contextUsage`) |
| System instructions | `inCloudParams.systemInstruction` | `onDeviceParams.createOptions.initialPrompts` (`role: 'system'`) |
| Structured JSON output | `inCloudParams.generationConfig.responseJsonSchema` (or `responseSchema`) | `onDeviceParams.promptOptions.responseConstraint` |
| App Check token required | **Yes (Enforced)** | **No** (runs 100% locally offline) |
