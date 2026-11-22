# Gemini Nano (Chrome Prompt API / Firebase AI Logic) quality, reliability and latency for privacy tasks (as of 22 Nov 2026)

## Q1. Are there published benchmarks of Gemini Nano (Chrome) on NER/PII detection, extraction, classification, passage selection, routing, extractive QA, or JSON structured-output reliability?

### Takeaway
I found **no published evaluation of Chrome's Gemini Nano** on NER/PII detection, role labelling, paragraph selection, answerability routing or extractive QA, and no measured JSON-schema compliance rate. Everything quantitative below is a **proxy**: other small models (Qwen2.5-3B, fine-tuned SLMs, 1-bit 1.7B models) on PII tasks, plus one anecdotal 2025 report of Nano ignoring `required` fields. Envoy will need its own small eval set.

### Cited Findings
- **Nano-specific, anecdotal (Chrome 137, July 2025):** swyx's notes say Nano "doesn't do great instruction following, so required fields aren't really respected." In his example the model was constrained to `{name, age}` and returned only `{ "age": 29 }`. He estimates the model at "4-6B at 4-8bit quantization", with a 1.5–2.4 GB download. This is one example on an old build, not a measured rate. — [swyx, GitHub issue #536](https://github.com/swyxio/swyxdotio/issues/536)
- **Google's claim about structured output:** "Developers can now assume the model's response is valid JSON" when `responseConstraint` (JSON Schema, Chrome 137+) is used. The page publishes no compliance or accuracy numbers (last updated 13 May 2025). — [Chrome: Structured output for the Prompt API](https://developer.chrome.com/docs/ai/structured-output-for-prompt-api)
- Firebase AI Logic says structured output ("Generating structured output, including JSON and enums") is supported for on-device hybrid inference. — [Firebase: Hybrid on-device inference](https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference)
- **Proxy: small LLM vs NER vs Presidio (Sept 2026).** "Mind the Gap" compares spaCy en_core_web_lg, Microsoft Presidio and Qwen2.5-3B-Instruct (zero-shot) on 660 examples / 2,680 annotations across 9 PII types:
  - Clean-set F1: spaCy 0.755, Presidio 0.818, Qwen2.5-3B 0.921.
  - Out-of-distribution F1: 0.691, 0.762, 0.848.
  - The 3B LLM was best overall, but its person recall (0.777) was lower than spaCy's (0.951).
  - It confused credit cards with SSNs (0.543 recall on OOD vs 1.000 clean) and merged cities into ADDRESS spans.
  - It produced unparseable JSON on 2.5% of OOD inputs (14 total failures). This was without constrained decoding.
  — [arXiv 2609.03464](https://arxiv.org/html/2609.03464v1)
- **Proxy: RedactionBench (June 2026).** 200 manually annotated documents across 11 domains, 35 models, character-level "R-Score":
  - Agentic frontier LLMs 0.71, best BERT-based 0.58, best GLiNER 0.47, best SLM fine-tuned for PII 0.45, humans 0.77.
  - Annotators agreed 89.4% on mandatory entities but only 47.7% on context-dependent redactions.
  - Regex and Presidio were not evaluated.
  — [arXiv 2606.18782](https://arxiv.org/html/2606.18782)
- **Proxy: 1-bit Bonsai-1.7B (May 2026).** In a PII-substitution task, downstream English NER F1 with SLM-generated surrogates was 0.346, against 0.656 for a rule-based faker. — [arXiv 2605.13538](https://arxiv.org/abs/2605.13538)

### Inferences
- A 3B-class model can be the strongest single PII detector on messy text, by about 0.07–0.1 F1 over Presidio. Nano is estimated at 4–6B, but that size estimate is unofficial. The same model still misses names that a classic NER catches, and it confuses digit-string types. For Envoy, that argues for regex/NER for format-rigid PII plus Nano for *roles* (landlord/tenant), not Nano alone.
- Role assignment (which party is "landlord") is the kind of context-dependent judgement where even humans agree less than 50% in RedactionBench. Expect it to be the weakest of Envoy's sub-tasks, and keep a user-confirmation step.
- `responseConstraint` should remove *syntax* failures like Qwen's 2.5%. It does not guarantee *semantic* completeness: the swyx example shows a `required` field missing (2025 build). Validate parsed output in code and retry.

### Gaps
- No measured Nano precision/recall on English contracts, and no role-labelling data for Nano or any small model.
- No Nano evaluation for (b) picking minimal relevant paragraphs, (c) answerability routing, or (d) short extractive answers. The RAG search turned up only cloud-Gemini pipelines.
- No measured `responseConstraint` schema-compliance rate on current (2026) Nano builds.
- Model version: one unofficial hackathon overview mentions "Gemini Nano 4", but no Chrome doc I fetched names a version (see Q6).

## Q2. What is the typical latency (TTFT, tokens/sec) on CPU vs GPU laptops, session creation time, and the effect of initialPrompts?

### Takeaway
Warm, GPU-backed Nano is fast: about 80–240 ms TTFT and about 50 tok/s on an M4 Pro. Cold start can be about 11 s. The only large real-world field study found a **median of 7.7 s and a p90 of 24 s per generation on users' mixed hardware**, about 6x slower than a cloud call. That product dropped the feature in Sept 2026. I found **no measured CPU-backend tokens/sec**.

### Cited Findings
- **Field data (largest sample; best real-world evidence):**
  - 836 users; 40.7% (340) were Nano-eligible; about 25% of eligible users already had the model downloaded.
  - On-device over 4,774 generations: median 7.7 s, p10 1.9 s, p90 24.2 s, p99 52.9 s, worst case 9+ minutes.
  - Server-side Gemma 3n over 7,750 generations: median 1.3 s, p99 2.4 s.
  - Median model download 1.9 minutes (about 1.5–2 GB).
  - The feature was discontinued in September 2026 because of low coverage and the cost of maintaining two inference paths.
  — [SendCheckIt blog](https://sendcheckit.com/blog/ai-powered-subject-line-alternatives)
- **Controlled single-machine measurements (MacBook Pro M4 Pro, 20-core GPU, 24 GB, "GPU highest quality" backend):**
  - About 50 tok/s generation (47.3–51.5 on 500-token essays, 56+ on short answers).
  - Warm TTFT about 80–90 ms.
  - About 2.9 s TTFT for a roughly 3,000-token prompt, so prefill runs at about 1,000 tok/s.
  - Model on disk about 4,072 MiB.
  - "No documented method exists to predict performance without running an actual prompt."
  — [Ar9av/gemini-nano-chrome](https://github.com/Ar9av/gemini-nano-chrome)
- **Cold start (Chrome 141 stable, July 2026):** 11 s to first token on a fresh profile, 240 ms warm (median of 10 runs; receipt OCR + JSON categorization task). The author recommends a dummy warm-up inference in `requestIdleCallback` at page load. — [bizflowai](https://bizflowai.io/blog/chromes-built-in-ai-11-second-cold-start-on-a-fresh)
- **Low credibility, uncorroborated:** a blog claims a Vercel production deployment with median 290 ms and p95 680 ms, a "~1024-token system prompt ceiling", "~6 req/s per origin", output degrading beyond 400 tokens, and a 1.8 GB download. That download size conflicts with the ~4 GB measured above. It gives no methodology. — [thestackstories](https://www.thestackstories.com/blog/browser-ai-gemini-nano-chrome-2026)
- **Hardware floor:** GPU with "strictly more than 4 GB of VRAM", or CPU with 16 GB RAM and 4+ cores. Also 22 GB free disk on the profile volume; the model is removed if free space drops below 10 GB. Windows 10/11, macOS 13+, Linux, and ChromeOS on Chromebook Plus only. — [Chrome: Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- **Google on input length and sessions:**
  - "latency grows significantly with input size"; strip irrelevant content.
  - Create a base session holding only system instructions and `clone()` it, instead of calling `create()` repeatedly.
  - Create the session as soon as user intent is clear.
  — [Chrome Modern Web Guidance: Language Model](https://developer.chrome.com/docs/modern-web-guidance/guides/built-in-ai/language-model.md.txt)
- ML Kit says inference speed "is heavily dependent on the output length". It recommends prefix caching when few-shot examples make prompts long. — [ML Kit: Prompt design for Gemini Nano](https://developers.google.com/ml-kit/genai/prompt/android/prompt-design?hl=en)

### Inferences
- Warm-TTFT figures (80–240 ms) and the 7.7 s field median measure different things. The field number is end-to-end generation on mixed hardware, including CPU and weak-GPU machines and probably cold sessions. A demo on a strong GPU laptop will look fast; real users will see long tails.
- At about 1,000 tok/s prefill, a full ~8k-token contract chunk costs about 8 s before the first output token, even on an M4 Pro. Sending *only candidate paragraphs* (pre-filtered with keyword/BM25 in JS) matters for latency as well as quality.
- Keep outputs short (labels, IDs, spans), because generation runs at about 50 tok/s at best.
- Warm up at page load, and clone a base session that holds the system prompt.

### Gaps
- No measured CPU-backend tok/s or TTFT anywhere.
- No numbers on `LanguageModel.create()` time when the model is already downloaded but not loaded, separate from first-token time.
- No measurement of how much `initialPrompts`/system prompt length adds to per-call latency, beyond the general prefill rate.
- Snippets I could not tie to a fetched page, so they are not used as evidence: "45 tok/s on M2 MacBook Air" and "50–300 ms typical TTFT".
- A search snippet (not fetched) from a Chromium discussion thread says that on a no-GPU PC, Nano's backend showed "GPU (highest quality)" instead of "CPU" after an update. That would mean backend selection can misfire. Unverified. — [chrome-ai-dev-preview-discuss](https://groups.google.com/a/chromium.org/g/chrome-ai-dev-preview-discuss/c/TFVnnmIoJPE/m/vQIQ-Fq6CAAJ)

## Q3. What are the known failure modes (hallucinated entities, schema violations, refusals, truncation, context limits) and how should long documents be chunked?

### Takeaway
The documented failure modes are:
- missing required fields under a schema (2025 anecdote);
- entity-type confusion and span merging (small-LLM proxy);
- few-shot examples being copied verbatim into outputs (1.7B proxy);
- silent context overflow that drops the oldest turns;
- hard quota errors.

The context window is **9,216 tokens on current builds** (6,144 in Chrome 137, July 2025), shared between input and output. Long contracts must be pre-chunked and pre-filtered client-side.

### Cited Findings
- **Context window:**
  - Firebase: "The maximum token limit is 9216 tokens" for on-device inference. — [Firebase: Hybrid on-device inference](https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference)
  - Measured as 9,216 tokens shared between input and output; exceeding it throws `QuotaExceededError`. — [Ar9av/gemini-nano-chrome](https://github.com/Ar9av/gemini-nano-chrome)
  - Earlier value: 6,144 tokens ("6k") in Chrome 137 (July 2025). — [swyx #536](https://github.com/swyxio/swyxdotio/issues/536)
- **API naming change:** the Oct 2026 Chrome doc uses `session.contextUsage` / `session.contextWindow` and a `contextoverflow` event. The older `inputQuota` / `inputUsage` / `measureInputUsage` names appear in earlier material; check which names the installed Chrome version exposes. On overflow, "the initial portions of the conversation ... will be removed, one prompt and response pair at a time", but system prompts are kept. — [Chrome: Prompt API (updated 21 Oct 2026)](https://developer.chrome.com/docs/ai/prompt-api)
- `omitResponseConstraintInput` stops the schema text from counting against the context window. — [Chrome: Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- **Supported languages:** 'en', 'ja', 'es', 'de', 'fr' for inputs and outputs. — [Chrome: Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- **Unsupported on-device in Firebase hybrid:**
  - multi-turn chat (single-turn only);
  - tools/function calling, code execution, grounding;
  - server prompt templates;
  - token counting;
  - PDF/audio/video input.

  On-device requests are not monitored. — [Firebase: Hybrid on-device inference](https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference)
- **Schema violation:** the `required` field was not respected (Chrome 137, 2025). — [swyx #536](https://github.com/swyxio/swyxdotio/issues/536)
- **Conversational filler:** "Models might include conversational filler that breaks your parser" without `responseConstraint`. Google also advises against enforcing length with schema `maxLength` because it "causes models to compress output unnaturally"; truncate client-side instead. — [Chrome Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/built-in-ai/language-model.md.txt)
- **Hallucinated or copied entities (proxy):** with fixed three-shot examples, a 1-bit 1.7B SLM "regurgitates demonstration outputs verbatim regardless of input". Sampling three examples per input from a pool (MD5-seeded) fixed it: 482/482 calls with no echoes. — [arXiv 2605.13538](https://arxiv.org/abs/2605.13538)
- **Type confusion and span merging (proxy, Qwen2.5-3B):** credit cards labelled as SSN, and cities absorbed into ADDRESS. — [arXiv 2609.03464](https://arxiv.org/html/2609.03464v1)
- **Security:** model output is untrusted; never assign it to `innerHTML`. — [Chrome Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/built-in-ai/language-model.md.txt)

### Inferences
- **Hallucinated-entity guard:** for every entity Nano returns, check that its exact surface string occurs in the source chunk (`indexOf`), and drop any that don't. This cheaply catches both demonstration echoes and invented names. Use few-shot examples whose names can never appear in real contracts (e.g. "Zorblat Ltd"), or rotate examples.
- **Chunking:** about 9.2k tokens must hold the system prompt, examples, schema (unless omitted), chunk text and output. A reasonable budget is about 1–1.5k tokens for the prompt and examples, 3–5k for document text and under 500 for output, leaving margin. Split on clause/paragraph boundaries, keep paragraph IDs, and run single-turn calls on a cloned base session. Single-turn is required in Firebase hybrid anyway.
- **Entity identity across chunks:** with per-chunk calls, merge entities across chunks in code by normalising strings, so the same party gets the same placeholder.

### Gaps
- No data on refusal rates or safety-filter false positives on contract text with PII.
- No data on output truncation mid-JSON under `responseConstraint`.
- I could not confirm from the Firebase page how `onDeviceParams.promptOptions` passes `responseConstraint` through. The narrow fetch did not return that detail; check the Firebase SDK reference or source.

## Q4. What do Google and Firebase officially say about prompting the built-in model and small models?

### Takeaway
Google's guidance for Nano comes down to:
- one focused task per call, with multi-step work chained in code;
- short structured prompts with `##` / XML-style delimiters;
- well-distributed few-shot examples;
- short outputs;
- JSON Schema via `responseConstraint`;
- low randomness.

Temperature 0.2 is Android ML Kit advice. On the **web** only `samplingMode` is available; `temperature`/`topK` are extension-only.

### Cited Findings
- **ML Kit "Prompt design for Gemini Nano" (Android, but the same model family):**
  - "Add well-distributed examples to your prompt"; use prefix caching when examples make the prompt long.
  - Avoid verbose preambles; use system instructions for repeated directives.
  - Structure prompts into instructions / constraints / examples.
  - Keep output brief.
  - "Use delimiters like `<background_information>`, `<instruction>`, and `##`". The `##` separator is "particularly critical for Gemini Nano."
  - "break multi-step reasoning into separate calls chained via code".
  - "For tasks such as entity extraction ... consider starting with a temperature value of 0.2."
  — [ML Kit: Prompt design for Gemini Nano](https://developers.google.com/ml-kit/genai/prompt/android/prompt-design?hl=en)
- **Chrome structured-output guidance:**
  - Describe constraints in natural language in the prompt as well as in the schema.
  - Include a valid example JSON object.
  - Test schemas with the JSON Schema tester.
  - Use `@types/dom-chromium-ai` for TypeScript types.
  — [Chrome: Structured output](https://developer.chrome.com/docs/ai/structured-output-for-prompt-api)
- **Web sampling:** `samplingMode` (enum from "most-predictable" to "most-creative"). Numeric `topK`/`temperature` and `LanguageModel.params()` work in extensions only. — [Chrome: Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- **Other Chrome guidance:**
  - Pass the schema as a plain object, not a string.
  - Clone a system-prompt-only base session for independent tasks.
  - Strip irrelevant input.
  - Wrap `create()`, `prompt()` and `JSON.parse()` in try/catch.
  - Treat `AbortError` as expected when the user cancels.
  - Note that localStorage chat history "may include user PII".
  — [Chrome Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/built-in-ai/language-model.md.txt)
- **Firebase:**
  - On-device is single-turn only.
  - The model download can take "several minutes", so pre-download.
  - A user activation (click) is needed before `initializeDeviceModel()`.
  - Modes are PREFER_ON_DEVICE / ONLY_ON_DEVICE / PREFER_IN_CLOUD / ONLY_IN_CLOUD.
  - Requires Chrome desktop 139+ "with the Prompt API flag enabled" (as the page read on 22 Nov 2026). If that is still true, judges and testers may need to set `chrome://flags` to see the on-device path.
  — [Firebase: Hybrid on-device inference](https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference)

### Inferences
- **For Envoy, as separate single-purpose calls:**
  - (a) entity+role extraction per chunk, with an enum-typed role field in the schema;
  - (c) routing as a boolean/enum schema ("answerable" / "not_answerable");
  - (b) paragraph selection as an array of paragraph IDs drawn from an enum of the IDs actually present;
  - (d) an extractive answer as a short string that must be a verbatim quote, checked with `indexOf`.

  Enum constraints are the strongest guard Nano offers against invented values.
- **Privacy routing:** use ONLY_ON_DEVICE for the redaction step so raw PII never falls back to the cloud. PREFER_ON_DEVICE would silently send raw text to the cloud when Nano is unavailable. That would undermine the privacy claim; confirm the fallback behaviour against the Firebase doc.

### Gaps
- I found no Chrome-specific "prompt design for small models" page beyond the ML Kit page and Modern Web Guidance. I also found no Firebase page on prompt wording specifically for on-device.

## Q5. What does research say about small local models as privacy filters (PAPILLON and 2025–2026 follow-ups)?

### Takeaway
PAPILLON's headline figures (85.5% quality preserved, 7.5% leakage) are confirmed, but they are for **Llama-3.1-8B-Instruct** as the local model with GPT-4o-mini as the cloud model, not for 1–3B models. Llama-3.2-1B and 3B leaked **39.3% and 24.9%** (Table 4), consistent with the brief's "24–39%". 2025–2026 work favours **hybrids** (regex + NER + LLM) over any single small model.

### Cited Findings
- **PAPILLON abstract:** "85.5% of user queries" keep high quality, with leakage limited to "only 7.5%". NAACL 2025 Main; submitted 22 Oct 2024, revised 25 Mar 2025. The authors note "a large margin to the generation quality of proprietary LLMs". — [arXiv 2410.17127](https://arxiv.org/abs/2410.17127)
- **PAPILLON Table 4** (optimized pipelines, GPT-4o-mini as the cloud model; quality preserved / leakage):

  | Local model | Quality preserved | Leakage |
  |---|---|---|
  | Llama-3.2-1B-Instruct | 58.0% | 39.3% |
  | Llama-3.2-3B-Instruct | 60.9% | 24.9% |
  | Llama-3-8B-Instruct | 79.3% | 21.2% |
  | Llama-3.1-8B-Instruct | 85.5% | 7.5% |
  | Mistral-7B-Instruct | 77.6% | 11.9% |
  | Mistral-Small (22B) | 85.3% | 27.4% |

  The PUPA benchmark has 901 instances (PUPA-TNB 237, PUPA-New 664). The extraction tool's summary also gave pre-optimization leakage of 27.8% for 1B and 23.8% for 3B, and described 3B as "improving" to 24.9%. That is internally inconsistent, since leakage rose; treat the pre-optimization figures as unverified. — [arXiv 2410.17127 HTML](https://arxiv.org/html/2410.17127)
- **RECAP (Oct 2025):** regex + context-aware LLM with a three-phase refinement pipeline; 13 low-resource locales; over 300 entity types. It beats fine-tuned NER by 82% and zero-shot LLMs by 17% in weighted F1. — [arXiv 2510.07551](https://arxiv.org/abs/2510.07551)
- **Mind the Gap (Sept 2026):** spaCy, Presidio and Qwen2.5-3B have complementary failure modes. The authors recommend running all three in parallel with an entity merger, so the miss rate is "bounded by the intersection of their failure sets rather than the union". Presidio fails on spelled-out emails and over-matches dates, but has 1.000 SSN recall. — [arXiv 2609.03464](https://arxiv.org/html/2609.03464v1)
- **RedactionBench (June 2026):** SLMs fine-tuned for PII (0.45 R-Score) trail BERT-based (0.58) and GLiNER (0.47) models. Contextual redaction "remains an unsolved problem". — [arXiv 2606.18782](https://arxiv.org/html/2606.18782)
- **Locale-conditioned few-shot (May 2026):** fixed few-shot examples cause verbatim regurgitation in 1.7B models; per-input example sampling fixes it. — [arXiv 2605.13538](https://arxiv.org/abs/2605.13538)

### Inferences
- Leakage does not fall steadily with model size: Mistral-Small 22B leaked 27.4%, against 7.5% for Llama-3.1-8B. Prompt/pipeline optimization and model fit matter as much as size. Nano (about 4–6B, unofficial estimate) can't be assumed to land at 8B-level leakage; Envoy should measure leakage on its own contracts.
- The evidence supports Envoy's architecture as: regex for rigid formats (emails, phones, IBANs, postcodes, dates, money), plus Nano for names, organisations and addresses *with roles*, plus string-presence verification, plus user review. "Nano-only redaction" is not supported.
- PAPILLON's task (rewriting user queries for a cloud model) differs from Envoy's (redacting a document, then asking the cloud). Treat the numbers as directional.

### Gaps
- No study evaluates Gemini Nano specifically as a privacy filter.
- I did not verify Presidio + LLM hybrid numbers beyond Mind the Gap and RECAP. The ResearchGate/Protegrity and "lightweight models for PII masking" (arXiv 2512.18608) papers were found but not read.

## Q6. Which real-world projects or hackathon entries used Nano for privacy or redaction, and what are the #BuildHybridAI rules and judging criteria?

### Takeaway
The Chrome Built-in AI Challenge 2025 winners (announced 5 Dec 2025) include no redaction/PII product. "Private and offline" was a common selling point, and there was a "Best Hybrid AI Application" category. #BuildHybridAI 2026 closes **30 Nov 2026, 2:00 PM PT**. It is judged on four equally weighted criteria: Technological Implementation (including how well Firebase AI Logic hybrid inference is used), Design, Impact and Originality. Devpost blocked automated fetching, so the detailed rules below come from secondary sources.

### Cited Findings
- **Chrome Built-in AI Challenge 2025 winners** (announced 5 Dec 2025):
  - Most Helpful: Nutshell (hands-free browsing extension) and AAC Board AI (proofread/rephrase/translate, "privately and offline").
  - Best Multimodal: Phonaify and Pet Shelter App.
  - Best Hybrid: Mentelo (on-page tech-support chatbot) and Trail (offline trail companion).
  - Honorable mentions: BrowseBack, EduAdapt, Helix AI, Marionette, The Turing Werewolf.
  - The page gives no technical lessons about Nano quality.
  — [Chrome blog: AI challenge winners 2025](https://developer.chrome.com/blog/ai-challenge-winners-2025)
- **#BuildHybridAI dates and judging (search snippet of the Devpost page):** submissions open Mon 9 Nov 2026 and close Mon 30 Nov 2026 at 2:00 PM PT. The criteria are Technological Implementation ("How well the project is built and how effectively it uses Firebase AI Logic hybrid inference"), Design, Impact and Originality, "with equal weight". — [Devpost (via search)](https://firebasehybridaihackathon.devpost.com/); direct fetch of the main page and /rules returned HTTP 403.
- **Rule details, per an unofficial overview repo** (self-described independent; confirm against the official rules):
  - Route all AI inference through Firebase AI Logic, with real runtime calls.
  - Target at least one of: Web/Chrome or Android with "Gemini Nano 4", or iOS with Apple Foundation Models.
  - Integrate Firebase App Check (debug tokens allowed).
  - Demonstrate hybrid on-device/cloud behaviour and explain the architecture choices.
  - English UI.
  - No secrets, credentials or PII in public code or demos.
  - Public GitHub/GitLab repo with an open-source license (Apache-2.0 recommended).
  - English description.
  - Public YouTube demo of at most 3 minutes.
  - Prizes: USD 30,000 total (1st $10k, 2nd $7k, 3rd $4k, Best iOS / Android / Web $3k each).
  — [moruku36/buildhybridai-2026](https://github.com/moruku36/buildhybridai-2026)
- **Prize pool conflict:**
  - HackathonRadar lists a "$30,000 total" pool but also "$10,000 in cash prizes"; full rules were said to go live 9 Nov. — [HackathonRadar](https://www.hackathonradar.com/database/hackathon/buildhybridai-2026)
  - The Devpost search snippet said "$10,000 in cash prizes". — [Devpost (via search)](https://firebasehybridaihackathon.devpost.com/)
- **Cautionary production story:** an email-tool vendor shipped Nano for subject-line suggestions and removed it in Sept 2026. Only 40.7% of users were eligible, latency was 6x worse than cloud, and two code paths cost too much to maintain. — [SendCheckIt](https://sendcheckit.com/blog/ai-powered-subject-line-alternatives)

### Inferences
- Judges weight "how effectively it uses hybrid inference" inside the Implementation criterion. A privacy app that *explains why* the redaction runs on-device and the reasoning runs in the cloud fits that criterion directly.
- The demo should show Nano availability and download states and a graceful path for ineligible devices. About 60% of real users in the one field study could not run Nano.

### Gaps
- The official Devpost rules page could not be fetched (403). Confirm the "Gemini Nano 4" wording, App Check, the 3-minute video, the no-PII-in-demo rule and the prize split there.
- I found no hackathon entry or open-source project with *measured* results for Nano-based PII redaction. Chrome 2025 gallery entries were not searched individually for redaction tools.
- Snippet seen but not verified on a fetched page: "Prompt API stable in Chrome 148 (Google I/O 2026)". It conflicts with the Firebase page's wording that on-device needs Chrome 139+ "with the Prompt API flag enabled". Which is current is unconfirmed; test on a clean stable Chrome profile.
- The Firebase "structured output, including JSON and enums" quote came from a summarizer. I did not confirm it sits in the on-device-supported section rather than a general feature list.
