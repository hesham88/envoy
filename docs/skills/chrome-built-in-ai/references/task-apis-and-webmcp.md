# Chrome Built-in Task APIs, WebMCP & Model Caching Reference

Source: Official Chrome AI documentation — <https://developer.chrome.com/docs/ai/built-in-apis>, <https://developer.chrome.com/docs/ai/summarizer-api>, <https://developer.chrome.com/docs/ai/translator-api>, <https://developer.chrome.com/docs/ai/language-detection>, <https://developer.chrome.com/docs/ai/writer-api>, <https://developer.chrome.com/docs/ai/rewriter-api>, <https://developer.chrome.com/docs/ai/proofreader-api>, <https://developer.chrome.com/docs/ai/webmcp>, <https://developer.chrome.com/docs/ai/cache-models>.

---

## 1. Summarizer API (`Summarizer` — Stable in Chrome 138+)

Generates condensed summaries in configurable types, formats, and lengths. Stateless across `summarize()` calls (reuse the same instance).

```ts
if ('Summarizer' in self) {
  const options = {
    sharedContext: 'A residential lease agreement in Cairo.',
    type: 'key-points', // 'key-points' | 'tldr' | 'teaser' | 'headline'
    format: 'markdown', // 'markdown' | 'plain-text'
    length: 'short',    // 'short' | 'medium' | 'long'
  } as const;

  const avail = await Summarizer.availability(options);
  if (avail !== 'unavailable') {
    const summarizer = await Summarizer.create({
      ...options,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => console.log(e.loaded));
      },
    });
    const summary = await summarizer.summarize(longText, {
      context: 'Focus on rent increase and notice requirements.',
    });
    summarizer.destroy();
  }
}
```
- **Scaling beyond context limits ("Summary of Summaries"):** Split large documents into chunks that fit the context window, summarize each chunk with `summarizer.summarize(chunk)`, join the intermediate summaries, and run a final `summarizer.summarize(joinedSummaries)` pass.

---

## 2. Language Detector API (`LanguageDetector` — Stable in Chrome 138+)

Identifies BCP-47 language codes locally using a compact expert model.

```ts
if ('LanguageDetector' in self) {
  const avail = await LanguageDetector.availability();
  if (avail !== 'unavailable') {
    const detector = await LanguageDetector.create();
    const results = await detector.detect(text);
    // results: Array<{ detectedLanguage: string; confidence: number }> sorted high -> low
    const topLanguage = results[0]?.detectedLanguage;
  }
}
```

---

## 3. Translator API (`Translator` — Stable in Chrome 138+)

Translates text on-device using downloaded BCP-47 language packs. Note: To prevent fingerprinting, `Translator.availability({ sourceLanguage, targetLanguage })` reports language pairs as `'downloadable'` until a site instantiates a translator for that pair.

```ts
if ('Translator' in self) {
  const pair = { sourceLanguage: 'es', targetLanguage: 'en' };
  const avail = await Translator.availability(pair);
  if (avail !== 'unavailable') {
    const translator = await Translator.create({
      ...pair,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => console.log(e.loaded));
      },
    });
    const translated = await translator.translate('Hola mundo');
  }
}
```

---

## 4. Writer & Rewriter APIs (`Writer`, `Rewriter` — Origin / Developer Trial)

Stateless writing-assistance APIs that can be reused across unrelated inputs.

- **`Writer` options:** `tone: 'formal' | 'neutral' | 'casual'`, `format: 'plain-text' | 'markdown'`, `length: 'short' | 'medium' | 'long'`, `sharedContext?: string`. Methods: `writer.write(prompt, { context })`, `writer.writeStreaming(prompt, { context })`, `writer.destroy()`.
- **`Rewriter` options:** `tone: 'as-is' | 'more-formal' | 'more-casual'`, `format: 'as-is' | 'plain-text' | 'markdown'`, `length: 'as-is' | 'shorter' | 'longer'`, `sharedContext?: string`. Methods: `rewriter.rewrite(text, { context })`, `rewriter.rewriteStreaming(text, { context })`, `rewriter.destroy()`.

---

## 5. Proofreader API (`Proofreader` — Origin / Developer Trial)

Uses the base foundation model plus **Low-Rank Adaptation (LoRA)** weights downloaded automatically alongside the base model. Provides:
- **Correction:** grammar, spelling, and punctuation fixes.
- **Labels:** error category for each correction.
- **Explanation:** plain-language explanation of why each correction is needed.

---

## 6. WebMCP (`document.modelContext` — Proposed Standard for AI Agents)

Source: <https://developer.chrome.com/docs/ai/webmcp>

WebMCP lets web pages register structured, schema-validated tools (imperatively via JavaScript or declaratively via HTML form annotations) so browser-integrated AI agents can execute actions deterministically instead of brittle DOM scraping/actuation, keeping the user in the loop for confirmation:

```ts
// Imperative WebMCP registration (progressive enhancement)
if ('modelContext' in document) {
  (document as unknown as { modelContext: { registerTool(tool: unknown): void } }).modelContext.registerTool({
    name: 'analyzeContractClause',
    title: 'Analyze a contract clause privately',
    description: 'Loads a contract excerpt and question into Envoy for on-device analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        documentText: { type: 'string' },
        question: { type: 'string' },
      },
      required: ['documentText', 'question'],
    },
    annotations: { readOnlyHint: true },
    execute: async (input: { documentText: string; question: string }) => {
      // Trigger app state transition visibly for the user
      return { status: 'ready_for_user_review' };
    },
  });
}
```

---

## 7. Caching Custom Client-Side Models (`developer.chrome.com/docs/ai/cache-models`)

When serving custom WebGPU / Wasm / MediaPipe models (outside Chrome's built-in model manager):
- Serve immutable versioned model URLs with `Cache-Control: public, max-age=31536000, immutable`.
- Explicitly store large model weights in the browser **Cache API** (`caches.open('models-v1')`) or **Origin Private File System (OPFS)** rather than relying on the implicit HTTP cache.
