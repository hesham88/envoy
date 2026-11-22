---
name: chrome-built-in-ai
description: "Comprehensive guide and engineering playbook for Chrome's Built-in AI APIs (https://developer.chrome.com/docs/ai/built-in-apis and https://developer.chrome.com/docs/ai) — Prompt API (LanguageModel / Gemini Nano / Gemma 4), Summarizer, Translator, LanguageDetector, Writer, Rewriter, Proofreader, and WebMCP. Use when building, debugging, testing, or optimizing client-side on-device AI in Chrome web apps or Chrome extensions, checking hardware/disk/flag prerequisites, handling model downloads, managing sessions and context windows, enforcing JSON Schema responseConstraint, or running Playwright tests with on-device models. Triggers - 'Chrome built-in AI', 'LanguageModel', 'Prompt API', 'Gemini Nano', 'responseConstraint', 'chrome://on-device-internals', 'Summarizer API', 'Translator API', 'Writer API', 'Rewriter API', 'Proofreader API', 'WebMCP'."
---

# Chrome Built-in AI APIs (`chrome-built-in-ai`)

Source: Official Chrome AI documentation — <https://developer.chrome.com/docs/ai>, <https://developer.chrome.com/docs/ai/built-in-apis>, <https://developer.chrome.com/docs/ai/prompt-api>, <https://developer.chrome.com/docs/ai/built-in-ai-dos-donts>, <https://developer.chrome.com/docs/ai/session-management>, <https://developer.chrome.com/docs/ai/session-compacting>, <https://developer.chrome.com/docs/ai/understand-built-in-model-management>.
For hybrid cloud fallback with Firebase AI Logic (`firebase/ai`), use [`../firebase-ai-logic-hybrid/SKILL.md`](../firebase-ai-logic-hybrid/SKILL.md). For Task APIs (`Summarizer`, `Translator`, `LanguageDetector`, `Writer`, `Rewriter`, `Proofreader`), **WebMCP**, and client-side model caching details, read [`./references/task-apis-and-webmcp.md`](./references/task-apis-and-webmcp.md).

---

## 1. API Availability Matrix & Capabilities (2026)

| API Global (`self.*`) | Model Type | Web Status | Extension Status | Modalities & Languages |
| --- | --- | --- | --- | --- |
| **`LanguageModel`** (Prompt API) | Foundation (Gemini Nano / Gemma 4) | **Stable (Chrome 148+)** | **Stable (Chrome 138+)** | Text + Image/Audio input $\rightarrow$ Text/JSON output. Languages (Chrome 149+): **`en`, `es`, `ja`, `de`, `fr`**. Context window: **~9,216 tokens**. |
| **`Summarizer`** | Foundation | **Stable (Chrome 138+)** | **Stable (Chrome 138+)** | Text-to-text (`key-points`, `tldr`, `teaser`, `headline`). |
| **`Translator`** | Expert model + language packs | **Stable (Chrome 138+)** | **Stable (Chrome 138+)** | Text-to-text across supported BCP-47 language pairs. |
| **`LanguageDetector`** | Expert model | **Stable (Chrome 138+)** | **Stable (Chrome 138+)** | Text $\rightarrow$ ranked `{ detectedLanguage, confidence }[]`. |
| **`Writer`** / **`Rewriter`** | Foundation | Origin / Dev Trial | Origin / Dev Trial | Text generation & tone/length rewriting. |
| **`Proofreader`** | Foundation + LoRA weights | Origin / Dev Trial | Origin / Dev Trial | Grammar/spelling corrections, error type labels, plain-language explanations. |
| **`document.modelContext`** (WebMCP) | Browser Agent Protocol | Origin Trial (2026) | Origin Trial | Exposes structured JSON-schema tools on web pages for browser AI agents. |

- **TypeScript typings:** install `@types/dom-chromium-ai` (or declare minimal interfaces on `globalThis`).
- **Extension `manifest.json` note:** Remove deprecated `"aiLanguageModelOriginTrial"` permission; Prompt API is stable in MV3 extensions since Chrome 138.

---

## 2. Hardware, Storage & Profile Prerequisites (Plus Real-World Fixes)

Foundation-model APIs (`LanguageModel`, `Summarizer`, `Writer`, `Rewriter`, `Proofreader`) run **only on desktop** (Windows 10/11, macOS 13+, Linux, ChromeOS on Chromebook Plus; **not** Android or iOS Chrome):

1. **Compute:**
   - **GPU path:** Strictly **$> 4\text{ GB}$ VRAM** (Prompt API audio input requires GPU).
   - **CPU path:** **$\ge 16\text{ GB}$ RAM** ($\sim 15,000\text{ MiB}$ in Chromium's check) and **$\ge 4$ CPU cores**.
   - **Troubleshooting GPU Shader Crashes (`Model crash count: 3 / 3`):** On older GPUs (e.g., Pascal GTX 1050 Ti) that pass the VRAM check when `--force-high-performance-gpu` is set but crash ChromeML's Dawn/WebGPU pipeline, force the CPU backend by launching Chrome with:
     `--enable-features=OnDeviceModelForceCpuBackend,OnDeviceModelCpuBackend`
2. **Disk Space & the Windows `%TEMP%` Gotcha (`op_space_check.cc:77`):**
   - **Profile volume:** Requires **$\ge 22\text{ GB}$ free** on the volume containing the Chrome profile (`--user-data-dir`). Chrome **purges** the model automatically if free space later drops below **$10\text{ GB}$** (even mid-session!).
   - **Critical `%TEMP%` check:** Chrome's component updater (`components/update_client/op_space_check.cc:77`) checks free space in `%TEMP%` / `%TMP%` and requires **$2 \times \text{crx\_size}$** ($\sim 8.54\text{ GB}$ for `nano_v3_gpu_component` or $\sim 4.95\text{ GB}$ for `gemma4_component`). If `C:` is low on space, even a profile on `F:` will fail instantly with `0.0.0.0` `"Update error"` (`errorcat: 1, errorcode: 13` / `DISK_FULL`).
   - **Fix:** Set `TEMP` and `TMP` to a folder on the high-capacity drive before launching Chrome:
     `cmd.exe /c "set TEMP=F:\ChromeEnvoy-tmp&& set TMP=F:\ChromeEnvoy-tmp&& start \"\" \"C:\Program Files\Google\Chrome\Application\chrome.exe\" --user-data-dir=F:\ChromeEnvoy ..."`
3. **Browser Settings (Chrome 157+):**
   - Since Chrome 157, **On-device AI is off by default** in new profiles (`availability()` returns `'unavailable'`). Enable it in `chrome://settings/ai` $\rightarrow$ **On-device AI**.
   - Optional flag for Gemma 4 2B-IT (`gemma4_component`, `model_version/v4`): `chrome://flags/#gemma4-for-built-in-ai` (`"gemma4-for-built-in-ai@1"` in `Local State`).
   - Network: Unmetered connection required for the initial download only; after download, 100% of inference runs offline with zero network requests.

---

## 3. Canonical Lifecycle: `availability()` $\rightarrow$ User Activation $\rightarrow$ `create()`

**Golden Rule:** Always pass the **exact same options** (`expectedInputs`, `expectedOutputs`, `samplingMode`, etc.) to `availability(options)` and `create(options)`.

```ts
const MODEL_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
} as const;

export async function checkNanoAvailability(): Promise<'no-api' | 'unavailable' | 'downloadable' | 'downloading' | 'available'> {
  if (!('LanguageModel' in globalThis)) return 'no-api';
  try {
    return await LanguageModel.availability(MODEL_OPTIONS);
  } catch {
    return 'unavailable';
  }
}

// Must be called inside a user gesture (click handler) when status is 'downloadable'
export async function downloadAndWarmModel(onProgress?: (fraction: number) => void): Promise<void> {
  const session = await LanguageModel.create({
    ...MODEL_OPTIONS,
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => {
        onProgress?.(e.loaded); // e.loaded is 0..1
      });
    },
  });
  session.destroy();
}
```

- **Inform users of download & extraction:** When `e.loaded` reaches `1`, the browser still extracts and loads weights into memory before `create()` resolves—show an indeterminate loading state between `100%` and `create()` resolution.
- **Expect model disappearance:** Because Chrome can purge the model under disk pressure or hot-swap an update, never assume a one-time check at startup lasts forever; check availability or handle errors gracefully on every task.

---

## 4. Prompt API (`LanguageModel`) Best Practices (Do's & Don'ts)

1. **Set system instructions in `initialPrompts` at `create()` time (never in the first `prompt()`):**
   ```ts
   const baseSession = await LanguageModel.create({
     ...MODEL_OPTIONS,
     initialPrompts: [
       { role: 'system', content: 'You extract contract entities. Reply only with JSON matching the schema.' },
     ],
   });
   ```
2. **Clone baseline sessions (`clone()`) for independent tasks, and `destroy()` clones immediately:**
   - Every `LanguageModel` session accumulates conversation history. Reusing one session across unrelated prompts pollutes context and wastes tokens; calling `create()` repeatedly re-parses `initialPrompts`.
   - Create one clean `baseSession` with `initialPrompts`, then for each task:
     ```ts
     const clone = await baseSession.clone();
     try {
       return await clone.prompt(taskInput, { responseConstraint: schema });
     } finally {
       clone.destroy();
     }
     ```
   - *(Note: Unlike `LanguageModel`, `Summarizer`, `Writer`, and `Rewriter` instances are stateless across calls and should be reused directly without cloning.)*
3. **Use `responseConstraint` for Structured JSON Output — without tight `maxLength`:**
   - Pass a JSON Schema object via `{ responseConstraint: schema }` to `session.prompt(text, { responseConstraint })` or `session.promptStreaming(text, { responseConstraint })` (supported since Chrome 137).
   - **Don't** put strict character limits (like `maxLength: 125`) inside a `responseConstraint` schema—when constrained tightly, small models compress meaning by switching into high-density foreign characters or emoji. Let the model generate naturally and truncate/clamp in JS or CSS.
   - Always validate parsed JSON and **verify extracted spans verbatim against source text** (small models occasionally copy few-shot example names or hallucinate non-verbatim paraphrases).
4. **Optimize input size & respect the 9,216-token context window:**
   - Strip HTML tags, boilerplate, and irrelevant metadata before prompting; latency scales steeply with input tokens (especially on CPU).
   - Monitor `session.contextUsage` vs `session.contextWindow` and listen for the `contextoverflow` event. If a single prompt exceeds `contextWindow`, Chrome throws `QuotaExceededError`.
   - For long documents, chunk into clauses/batches ($\le 6,000$ tokens per call). For long multi-turn chats, use **Session Compacting**: summarize history with `Summarizer`, destroy the old session, and seed a new session with the summary in `initialPrompts` (`initialPrompts` are never evicted during context overflow).
5. **Sampling Parameters (`samplingMode` on Web vs `topK`/`temperature` in Extensions):**
   - **Web pages:** Use `samplingMode` enum (`'most-predictable' | 'predictable' | 'slightly-predictable' | 'balanced' | 'slightly-creative' | 'creative' | 'most-creative'`).
   - **Chrome Extensions:** Can still query `const params = await LanguageModel.params()` (`{ defaultTopK, maxTopK, defaultTemperature, maxTemperature }`) and pass `{ topK, temperature }` to `LanguageModel.create()` (must pass **both** `topK` and `temperature` or neither).
6. **Render streaming responses safely:**
   - Treat all model output as untrusted. Never do `element.innerHTML += chunk` (causes layout thrashing and cross-chunk XSS). Parse chunks into an off-screen `DocumentFragment` and sanitize the combined fragment before swapping with `replaceChildren()`.

---

## 5. Debugging & Automated Testing (`chrome://on-device-internals` & Playwright)

- **Inspecting live model state & prompts:**
  - Open `chrome://on-device-internals` $\rightarrow$ **Model Status / Broker State** to check hardware eligibility, VRAM/disk checks, crash count, and installed component version (`v3Nano` vs `gemma4_component`).
  - Open `chrome://on-device-internals` $\rightarrow$ **Event Logs** (and click **Dump** for JSON) to inspect exact raw prompts, system instructions, token counts, and model responses across all built-in AI APIs.
- **Playwright integration with the real on-device model:**
  - Use installed Chrome (`channel: 'chrome'`) with a persistent profile directory that already has the model downloaded.
  - **Critical:** Pass `ignoreDefaultArgs: ['--disable-features']` (or strip `OptimizationHints` from disabled features), because Playwright's default flags disable Chrome's `OptimizationGuideOnDeviceModel`.
