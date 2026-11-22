---
name: pair-ai-eval
description: "Human-centered AI problem framing, interaction design policies, precision/recall trade-off engineering, noisy-data evaluation, and hackathon/stakeholder pitch framing based on Google PAIR's People + AI Guidebook (https://pair.withgoogle.com/guidebook, Chapters 1–2 and Data/Eval Patterns). Use when deciding where AI vs deterministic code belongs, designing guardrails and interaction design policies, building eval datasets (tests/eval), choosing precision vs recall metrics, tuning prompts with Harness², or writing README/Devpost/video narratives for judges. Triggers - 'PAIR eval', 'interaction design policies', 'precision vs recall', 'noisy data', 'value-fit', 'AI evaluation strategy', 'hackathon pitch', 'judge framing', 'reward function'."
---

# Google PAIR Guidebook — Value-Fit, Policies, Evaluation & Judge Framing (`pair-ai-eval`)

Source: **Google People + AI Research (PAIR) Guidebook (v2 / Generative AI edition)** — <https://pair.withgoogle.com/guidebook> (Chapter 1: *User Needs + Defining Success*, Chapter 2: *Data & Model Evolution*, and the Data/Evaluation Patterns). For UI/UX design, calibrated trust, explainability, user control, and graceful error states (Chapters 3–6), use [`../pair-ai-ux/SKILL.md`](../pair-ai-ux/SKILL.md). For iterative prompt/harness optimization, combine this skill with [`../harness2/SKILL.md`](../harness2/SKILL.md). Detailed PAIR v2 Chapter 1–2 frameworks and worksheets are in [`./references/chapters-and-eval-worksheets.md`](./references/chapters-and-eval-worksheets.md).

## 1. AI Value-Fit & Division of Labor (*PAIR Ch. 1.1 & 1.2*)

*Pattern: Determine if AI adds value (`patterns#determine-if-ai-adds-value`)*

Never use a probabilistic model where a deterministic algorithm is faster, verifiable, and 100% accurate—and never rely solely on brittle regexes where semantic understanding is required. In any hybrid AI architecture, explicitly partition every step into one of four buckets and document **why**:

| Bucket | When to Use It | Envoy Example |
| --- | --- | --- |
| **1. Deterministic Pre-Processing & Rules** | Structured tokens with formal grammar or checksums where false negatives are unacceptable. | `packages/core/src/normalize.ts` (Arabic-Indic digit mapping) and `rules.ts` (mod-97 IBAN, Luhn cards, 14-digit Egyptian national ID, E.164/`+20` phones, emails, currency amounts, dates). |
| **2. On-Device Small Model (`ONLY_ON_DEVICE`)** | Private, semantic tasks over raw user data that require language understanding but must never leave the user's device. | `packages/core/src/prompts.ts` + `packages/ai/src/pipeline.ts`: unstructured entity/role detection (`[LANDLORD]`, `[TENANT]`), minimum clause selection (`selectClausesBatched`), local-vs-cloud routing (`route`), and simple factual answers (`answerLocal`). |
| **3. Cloud Frontier Model (`PREFER_IN_CLOUD`)** | Multi-step reasoning, synthesis, or policy interpretation over already-minimized, user-approved, de-identified inputs. | `reason` step in `pipeline.ts`: reasoning over masked clauses and emitting symbolic tag expressions (`{{RENT * 1.10}}`). |
| **4. Deterministic Post-Processing & Guards** | Verifying safety invariants before network calls and restoring exact calculations after model generation. | `device-guard.ts` (#10635 tripwire + `InferenceSource.ON_DEVICE` assertion), `guard.ts` (`checkOutbound` leak blocker), and `restore.ts` / `expr.ts` (safe local arithmetic evaluator). |

## 2. Interaction Design Policies (*PAIR Ch. 1.3*)

Generative AI products have open-ended inputs and probabilistic outputs. PAIR v2 Chapter 1.3 (*Define Interaction Design Policies*) requires codifying hard, testable behavioral policies at every critical boundary:

1. **Input & Context Policy:** Bound untrusted input with XML tags (`<document>`, `<question>`, `<clause id="N">`) and enforce token budgets (`MAX_TOKENS = 6000` inside Nano's 9,216-token context window via `batchChunks` and `splitChunk`) so long inputs never silently truncate.
2. **Grounding & Anti-Hallucination Policy:** Constrain structured outputs with strict JSON schemas (`DETECT_SCHEMA`, `MINIMIZE_SCHEMA`, `ROUTE_SCHEMA`) and **verify model outputs against source ground truth** (e.g., `parseDetectResponse` drops any entity that does not appear verbatim in the source document; `parseMinimizeResponse` filters to valid clause IDs; `restore.ts` leaves unknown tags or invalid expressions visible without crashing).
3. **Privacy & Safety Gate Policy:** Enforce pre-flight, in-flight, and post-flight invariants (`assertDeviceReady` → `withCloudTripwire` → `InferenceSource.ON_DEVICE` check; `checkOutbound` re-running all rule detectors and canonical fuzzy matching on user-edited excerpts before any cloud call).
4. **Domain Boundary Policy:** State clearly what the output is and is not (e.g., *"This explains your document; it isn't legal advice"*).

## 3. Precision vs. Recall Trade-offs (*PAIR Ch. 1.4 & Ch. 2.3*)

*Pattern: Make precision and recall tradeoffs carefully (`patterns#make-precision-and-recall-tradeoffs-carefully`)*

Before writing detectors, prompts, or eval scripts, define the asymmetry of errors using PAIR's Confusion Matrix & Reward Function worksheet:

| Sub-Task | False Positive (FP) Cost | False Negative (FN) Cost | Optimization Target |
| --- | --- | --- | --- |
| **PII & Entity Detection** (`detect` + `rules` + `guard`) | **Low:** An extra non-sensitive span is masked as a tag; the user can click it in `Review` to share it if needed. | **Critical (Privacy Leak):** A real name, ID, IBAN, or amount reaches the cloud unmasked. | **Maximize Recall ( target 0% leakage ).** Layer rules + on-device model + canonical outbound guard (`checkOutbound`). |
| **Clause Minimization** (`minimize`) | **Low–Moderate:** An extra clause is included (still masked), slightly increasing `charsSent`. | **High (Broken Answer):** The clause containing the answer is omitted, so the model cannot answer the question. | **High Recall on relevant clauses, then maximize Precision (compression ratio).** If Nano returns 0 valid IDs, fall back safely to all clauses (masked). |
| **Local vs. Cloud Routing** (`route`) | **Moderate (`answerable_locally: true` on a complex question):** Local small model gives an overly shallow answer. | **Low (`answerable_locally: false` on a simple lookup):** Goes through the Review gate to the cloud (still masked). | **Prioritize Precision on `answerable_locally: true`** (only route locally for direct factual lookups of dates, names, amounts, or periods). |

## 4. Holistic Evaluation & "Noisy" Data (*PAIR Ch. 2.2 & 2.3*)

*Patterns: Embrace "noisy" data (`#embrace-noisy-data`) · Actively maintain your dataset (`#actively-maintain-your-dataset`) · Learn from label disagreements (`#learn-from-label-disagreements`)*

When building or expanding `tests/eval/cases.json` and `docs/EVAL.md`:

1. **Start with user-benefit metrics alongside technical metrics:**
   - **Privacy Leakage % (Primary safety metric):** `% of gold sensitive values that appear in the final outbound excerpt` (must be **0.0%** with Envoy layered + guard).
   - **Minimization / Compression Ratio (Primary utility metric):** `charsSent / totalDocChars` and `clausesSent / totalClauses` (proving Envoy sends ~1 clause instead of 6 pages).
   - **Answer & Restore Accuracy:** `% of questions answered correctly with local tags/expressions restored accurately`.
   - **Schema Validity & Latency:** `% of on-device calls returning valid JSON on first pass` and `median/p95 ms per step`.
2. **Disaggregate across system layers (Ablation table):**
   Always report side-by-side results for:
   - **Rules alone (Basic protection)** — catches 100% of structured IDs/IBANs/phones/amounts/dates, misses unflagged contextual orgs/addresses, sends all clauses (masked).
   - **On-device model (Gemini Nano) alone** — catches semantic names/roles and minimizes clauses (~80–90% size reduction), but can occasionally miss a formatted code if used without rules.
   - **Envoy Layered (Rules + Nano + Outbound Guard)** — achieves both semantic role tagging + ~85% clause minimization **and** 0% PII leakage.
3. **Include "Noisy" real-world test cases:**
   - At least 25–30% of `tests/eval/cases.json` must test messy formatting: Arabic-Indic (`٠–٩`) and Eastern Arabic-Indic (`۰–۹`) digits, unspaced or dot-separated phones (`+20.100.555.0192`, `01005550192`), currency after number (`8,500 EGP`, `8500 LE`), all-caps names (`KARIM FATHY`), and multi-clause documents with distractor amounts.
4. **Tune with Harness² (`Propose → Probe → Compose`):**
   - When an eval metric underperforms, follow [`../harness2/SKILL.md`](../harness2/SKILL.md): log the baseline trace, propose invariant and domain prompt/schema edits, probe on `tests/eval/cases.json`, compose non-regressing winners, and record the evidence in `docs/harness/LESSONS.md`.

## 5. Framing for Hackathon Judges (`README.md`, Video, Devpost)

When writing external-facing project documentation or scripts (combine with `plain-technical-writing`):
- **Map directly to the 4 Devpost criteria:**
  1. *Technological Implementation:* Show the exact 6-step inference-mode table with clickable file/line links (`packages/ai/src/models.ts`, `device-guard.ts`, `pipeline.ts`) and the live `/dev` + `?inspect=1` proof.
  2. *Design:* Point out PAIR patterns in action—safe exploration (`Try a sample contract`), supervising automation (`Review` screen), actionable confidence (`Names to check`), and calibrated trust (`Privacy receipt`).
  3. *Potential Impact:* Anchor on a concrete person and document (Mona's 6-page Cairo lease with a 20% rent demand vs a 10% contractual cap in Clause 7).
  4. *Quality of the Idea:* Explain **Privacy-Conscious Delegation** (PAPILLON, NAACL 2025) + local symbolic arithmetic (`{{RENT * 1.10}}` → `EGP 9,350` computed on-device).
- **Be honest about limits (*PAIR: Set the right expectations*):** Document what Envoy does and does not do in a dedicated section of `README.md` (text PDFs only, no OCR; Basic protection fallback when Chrome's on-device model is unavailable; explains documents, not legal advice). Honesty about boundaries increases judge trust.
