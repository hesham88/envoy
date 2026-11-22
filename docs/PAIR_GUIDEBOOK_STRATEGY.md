# Winning #BuildHybridAI 2026 with the Google PAIR Guidebook

Source: **Google People + AI Research (PAIR) Guidebook (v2 / Generative AI edition)** — <https://pair.withgoogle.com/guidebook> ([Chapters](https://pair.withgoogle.com/guidebook/chapters) · [23 Design Patterns](https://pair.withgoogle.com/guidebook/patterns) · [Case Studies](https://pair.withgoogle.com/guidebook/case-studies)).

This document maps Google PAIR's human-centered AI framework directly to **Envoy** (`packages/core`, `packages/ai`, `apps/web`, `apps/extension`, `tests/eval`) and the four **#BuildHybridAI 2026** judging criteria. Companion skills for every agent and session live in [`docs/skills/pair-ai-ux/SKILL.md`](skills/pair-ai-ux/SKILL.md) and [`docs/skills/pair-ai-eval/SKILL.md`](skills/pair-ai-eval/SKILL.md) (and globally in `~/.claude/skills/`, `~/.agents/skills/`, and `~/.gemini/config/skills/`).

---

## 1. Why the PAIR Guidebook is a Hackathon Multiplier for Envoy

The **#BuildHybridAI 2026** contest is judged by Google and Firebase engineers, PMs, and designers across four equally weighted criteria (1–5 scale):

| Devpost Criterion (25% each) | What Judges Look For | How PAIR Gives Envoy an Unfair Advantage |
| --- | --- | --- |
| **1. Technological Implementation** *(1st tie-breaker)* | How well it is built and how effectively it uses **Firebase AI Logic hybrid inference**. | PAIR Ch. 1 (*Identify User Needs & AI Strengths*, *Define Interaction Design Policies*) and Pattern *Determine if AI adds value* justify **why each step uses a deliberate mode**: deterministic rules for checksummed IDs/IBANs, `ONLY_ON_DEVICE` (Gemini Nano) for semantic role extraction and clause minimization, and `PREFER_IN_CLOUD` (Cloud Gemini) for policy reasoning over masked tags—enforced by hard interaction policies (`device-guard.ts` for SDK bug #10635 and `guard.ts` for outbound leaks). |
| **2. Design** | A complete, coherent product experience, not a proof of concept. | PAIR Ch. 3–6 (*Mental Models*, *Trust & Explanations*, *Feedback & Controls*, *Errors & Graceful Failures*) directly govern Envoy's 4 screens: **safe exploration** (`Try a sample contract`), **non-anthropomorphic "privacy instrument" visual language**, **supervising automation** (`Review` screen with click-to-toggle tags, clause checkboxes, and live-checked excerpt editing), **calibrated trust** (`Privacy receipt` + `NetworkInspector`), and **first-class graceful fallback** (`Basic protection` + `OnDeviceGuide` + `OfflineBanner`). |
| **3. Potential Impact** | A credible, specific real problem for a real audience, shown in the demo. | PAIR Ch. 1 & 2 emphasize grounding AI in high-stakes human problems where trust barriers block adoption. People avoid asking cloud AI about leases, employment offers, and lab reports because current tools force an all-or-nothing choice: send raw PII or mask blindly and lose meaning. Envoy solves Mona's Cairo lease question while keeping 100% of identities on-device. |
| **4. Quality of the Idea** | A creative, non-obvious use of Firebase AI Logic, with real understanding of the problem. | Turning **Privacy-Conscious Delegation** (PAPILLON, NAACL 2025) into a human-in-the-loop product where the local model acts as the user's **privacy agent** to the cloud model—and local TypeScript evaluates `{{RENT * 1.10}}` expressions so the cloud never sees private amounts yet the user gets exact math (`EGP 9,350`). |

---

## 2. Mapping the 6 PAIR Chapters & 23 Patterns to Envoy

### Chapter 1: User Needs + Defining Success
*Sub-chapters: 1. Identify User Needs & AI Strengths · 2. Balance Automation & Augmentation · 3. Define Interaction Design Policies · 4. Prepare for Potential Pitfalls*

| PAIR Pattern / Concept | Envoy Implementation (`packages/*`, `apps/*`) | Status & Action |
| --- | --- | --- |
| **Determine if AI adds value** (`patterns#determine-if-ai-adds-value`) | Don't use AI where deterministic code is safer, and don't use heuristics where semantic context is required. Envoy splits the job cleanly:<br>1. **Deterministic rules (`packages/core/src/rules.ts`)**: mod-97 IBANs, Luhn cards, 14-digit Egyptian national IDs, E.164/`+20` phones, emails, money, dates.<br>2. **On-device Gemini Nano (`ONLY_ON_DEVICE`)**: unstructured person/org/address names + contractual role assignment (`[LANDLORD]`, `[TENANT]`), minimum clause selection (`selectClausesBatched`), and local-vs-cloud routing.<br>3. **Cloud Gemini (`PREFER_IN_CLOUD`)**: multi-step reasoning over masked clauses.<br>4. **Deterministic expression restore (`packages/core/src/expr.ts`)**: evaluates `{{RENT * 1.10}}` locally without LLM arithmetic hallucination. | **Wired.** Highlight this 4-way division of labor in `README.md` and the video script. |
| **Balance Automation & Augmentation** (`chapters/user-needs-and-defining-success/balance-automation-and-augmentation/`) | Envoy **automates** tedious PII scanning and clause filtering on-device, then **augments** the user's decision at the Review gate (`Review.tsx`) before anything leaves the device. | **Wired.** |
| **Define Interaction Design Policies** (`chapters/user-needs-and-defining-success/define-interaction-design-policies/`) | Hard code-enforced boundaries for open-ended GenAI inputs:<br>• **Policy 1 (No silent cloud fallback):** `device-guard.ts` pre-checks `LanguageModel.availability()`, wraps `fetch` with `withCloudTripwire` against `firebasevertexai.googleapis.com`, and post-checks `InferenceSource.ON_DEVICE` (#10635).<br>• **Policy 2 (No outbound PII leak):** `checkOutbound` (`guard.ts`) re-scans edited excerpts and blocks `Approve and send` if raw values reappear.<br>• **Policy 3 (No verbatim hallucination):** `parseDetectResponse` (`prompts.ts`) drops any entity Nano returns that is not a verbatim substring of the source text.<br>• **Policy 4 (Domain disclaimer):** "This explains your document; it isn't legal advice." | **Wired.** Frame these four guardrails in `README.md` as our **PAIR Interaction Design Policies**. |

### Chapter 2: Data & Model Evolution (Data Collection + Evaluation)
*Sub-chapters: 1. Define your AI and data requirements · 2. Prepare your data for AI · 3. Evolve AI with evaluation*

| PAIR Pattern / Concept | Envoy Implementation (`tests/eval`, `packages/core`) | Status & Action |
| --- | --- | --- |
| **Make precision and recall tradeoffs carefully** (`patterns#make-precision-and-recall-tradeoffs-carefully`) | In privacy protection, **false negatives (missing a PII entity) are high-stakes leaks**, whereas a false positive (masking a non-sensitive phrase) is low-risk and easily toggled in Review. Conversely, in clause minimization, sending 1–2 relevant clauses maximizes privacy (**precision**), while falling back to all masked clauses when uncertain preserves answer quality (**recall**). | **Built in engine; wire into Phase 5 Eval (`docs/EVAL.md`).** Report **PII Recall / Leakage %** and **Clause Compression Ratio (chars sent vs doc chars)** side by side. |
| **Embrace "noisy" data** (`patterns#embrace-noisy-data`) | Real contracts have irregular spacing, line breaks inside IBANs, phone numbers formatted as `+20 100 555 0192` vs `01005550192`, currency before or after amounts (`EGP 8,500` vs `8,500 EGP`), and Arabic-Indic digits (`٠–٩`). `normalize.ts`, `canonical()` in `tags.ts`, and `compact()` in `guard.ts` already normalize these. | **Include noisy-format stress cases in `tests/eval/cases.json`** so our eval proves robustness on messy real-world inputs. |
| **Evolve AI with evaluation** (`chapters/data-and-model-evolution/evolve-ai-with-evaluation/`) | Disaggregated evaluation comparing three conditions on the same 30–50 benchmark cases: **1. Rules alone (Basic protection)**, **2. On-device Nano alone**, and **3. Envoy layered (Rules + Nano + Outbound Guard)**, tuned iteratively with `harness2` Propose–Probe–Compose. | **Next phase (`tests/eval`).** Use the evaluation matrix in [`docs/skills/pair-ai-eval/SKILL.md`](skills/pair-ai-eval/SKILL.md). |

### Chapter 3: Mental Models + Expectations
*Sub-chapters: 1. Identify existing mental models · 2. Introduce AI in stages · 3. Plan for co-learning · 4. Account for expectations of human-like interaction*

| PAIR Pattern / Concept | Envoy Implementation (`apps/web`, `apps/extension`) | Status & Action |
| --- | --- | --- |
| **Make it safe to explore** (`patterns#make-it-safe-to-explore`) | New users hesitate to upload real contracts before seeing how masking works. `Start.tsx` offers **"Try a sample contract"** (fictional Cairo residential lease with notice) and 3 one-click suggested question chips so judges and users can test-drive in 2 seconds with zero risk. | **Wired.** |
| **Anchor on familiarity** (`patterns#anchor-on-familiarity`) | Uses familiar document-review metaphors: highlighter marks (amber underline for personal details kept on device, dashed blue border for shared clauses, strikethrough for hidden sentences) and an itemized receipt (`Privacy receipt`). | **Wired.** |
| **Account for human-like interaction (Avoid anthropomorphism)** (`chapters/mental-models-and-expectations/account-for-human-like-interaction/`) | PAIR warns that human-like personas ("I read your contract and I think…") inflate expectations and erode trust when errors occur. Envoy is designed as a **"privacy instrument"**: no chat avatar, no first-person "I", no AI sparkles, IBM Plex Sans/Mono, seal/chevron mark. | **Wired.** Keep all UI and prompt output strictly third-person / instrumental. |
| **Introduce AI in stages** (`chapters/mental-models-and-expectations/introduce-ai-in-stages/`) | Progressive disclosure across the 3-step stepper (`1 Detect → 2 Review → 3 Answer`), with `HowItWorks` on Start, contextual legend in Review, `Privacy receipt` on Answer, and deep technical details in `AboutDialog` and `NetworkInspector`. | **Wired.** |

### Chapter 4: Trust + Explanations (Explainability + Trust)
*Sub-chapters: 1. Understand trust in the context of your product · 2. Calibrate trust throughout the product experience · 3. Crafting helpful explanations for understanding and action*

| PAIR Pattern / Concept | Envoy Implementation (`apps/web`) | Status & Action |
| --- | --- | --- |
| **Explain the benefit, not the technology** (`patterns#explain-the-benefit-not-the-technology`) | Hero copy leads with user value: *"Ask the cloud. Keep your secrets."* and *"Your names, IDs and numbers stay on this computer"*, while keeping model flags (`ONLY_ON_DEVICE`, `PREFER_IN_CLOUD`) in `ModeChip`, `AboutDialog`, and `/dev`. | **Wired.** |
| **Explain for understanding, not completeness** (`patterns#explain-for-understanding-not-completeness`) | Users don't need token probabilities; they need to know **which clause was picked and why**, **what the cloud will see**, and **where each value came from**. | **Opportunity (Quick Win #1 below):** `analysis.selectionReason` and `analysis.route.reason` are already returned by `pipeline.ts` (`selectClausesBatched` & `parseRouteResponse`), and `BRIEF.md` §4 specifies showing the routing explanation, but `Review.tsx` / `Answer.tsx` don't display them yet! Surface both one-line explanations cleanly. |
| **Determine how to show model confidence, if at all** (`patterns#determine-how-to-show-model-confidence-if-at-all`) | PAIR advises against raw percentage floats (`0.85` vs `0.40`) when users can't act on numbers. Instead, Envoy translates confidence into **actionable tiers**: high-confidence rule/Nano detections are masked automatically, while lower-confidence heuristic name matches (`0.4` in Basic protection) are masked by default *and* called out in `FoundList` under **"Names to check (masked by default)"**. | **Wired.** |
| **Be transparent about privacy and data settings** (`patterns#be-transparent-about-privacy-and-data-settings`) | Persistent header `StatusPill` (`Private mode on · on-device model ready` vs `Basic protection`), green (`--device`) vs blue (`--cloud`) badges always paired with icon + text label, `Privacy receipt` (`Left your device` vs `Stayed on device`), and footer notice that the tag map lives only in tab memory. | **Wired.** |
| **Go beyond in-the-moment explanations** (`patterns#go-beyond-in-the-moment-explanations`) | `AboutDialog.tsx` (6-step inference mode table, SDK bug #10635 guard explanation, PAPILLON citation) + `NetworkInspector.tsx` (`?inspect=1` or `Ctrl+Shift+I` showing live outbound payloads and blocked tripwire requests). | **Wired.** |

### Chapter 5: Feedback + Controls
*Sub-chapters: 1. Align user feedback with model improvement · 2. Design AI Feedback Loops · 3. Offer control over the AI experience*

| PAIR Pattern / Concept | Envoy Implementation (`apps/web/src/screens/Review.tsx`) | Status & Action |
| --- | --- | --- |
| **Let users supervise automation** (`patterns#let-users-supervise-automation`) | Before any cloud call, `Review.tsx` stops at a mandatory human approval gate (`Waiting for your approval` → `Approve and send`). | **Wired.** |
| **Automate more when risk is low** (`patterns#automate-more-when-risk-is-low`) | When `route` determines a question is a simple factual lookup (`answerable_locally: true`, e.g., *"When does my contract end?"*), `answer()` in `pipeline.ts` answers **100% on-device (`answerLocal`) with 0 cloud calls**. | **Opportunity (Quick Win #2 below):** When `analysis.mode === 'private' && analysis.route.local` is `true`, `Review.tsx` / `CloudPreview.tsx` should tell the user that this question can be answered directly on-device (`0 cloud calls`) rather than only saying `"What the cloud will see"`! |
| **Give control back to the user** (`patterns#give-control-back-to-the-user`) | Three levels of user override in `Review.tsx`:<br>1. **Entity-level toggle (`TOGGLE_TAG`)**: click any highlight to cycle `masked → hidden (removes sentence) → shared (sends real value)`.<br>2. **Clause-level toggle (`SET_CLAUSES`)**: check/uncheck any clause in `DocumentViewer`.<br>3. **Raw payload override (`EDIT_OUTBOUND`)**: click `Edit excerpt` to edit the outbound text by hand, continuously re-verified by `checkOutbound`. | **Wired.** |

### Chapter 6: Errors + Graceful Failures
*Sub-chapters: 1. Understand "errors" & "failure" · 2. Identify sources of error · 3. Provide paths forward from failure*

| Failure / Edge Case | Source of Error | Envoy's Graceful Recovery Path (`awareness + what happened + next action`) |
| --- | --- | --- |
| **1. Browser lacks `LanguageModel` or on-device AI is off** (~59% of machines / judges) | Environment / hardware | `device-guard.ts` catches `no-api` / `unavailable` **before** calling `ONLY_ON_DEVICE` (preventing SDK bug #10635). Switches to **Basic protection** (deterministic rules + heuristic name flagging, all clauses masked for manual selection) and displays the 3-step `OnDeviceGuide` with live `Check again`. |
| **2. Model is still downloading when user clicks Analyze** | Async lifecycle | Runs immediately in **Basic protection** with banner: *"Your on-device model is still downloading, so this run uses Basic protection."* Never hangs silently. |
| **3. On-device model crashes or errors mid-pipeline** | Model / WebGPU / CPU runtime | `analyze()` catches the error (unless it was a `PrivacyViolationError` tripwire hit), populates `analysis.fallbackReason`, and completes the run in **Basic protection** with a clear notice explaining why. |
| **4. User or model leaves raw PII in the outbound excerpt** | User edit / alignment error | `checkOutbound` (`guard.ts`) detects raw or reformatted PII (even unspaced IBANs or reformatted phones), disables `Approve and send`, and renders an inline alert naming each leaked item and how to fix it. |
| **5. Network drops before/during cloud reasoning** | Connectivity | `OfflineBanner` appears; `PREFER_IN_CLOUD` falls back to on-device reasoning and labels the result `"Lighter on-device answer (cloud unreachable)"`. PWA service worker serves the app shell offline. |
| **6. Scanned PDF with no selectable text layer** | User input format | `readFile.ts` rejects empty-text PDFs with a clear message instructing the user to paste text or use a text-based PDF, rather than running an empty analysis. |

---

## 3. High-Leverage Quick Wins to Implement in Envoy

Auditing the codebase against the PAIR Guidebook surfaced four concrete, low-risk improvements that directly boost our **Design**, **Technological Implementation**, and **Quality of the Idea** scores:

1. **Surface On-Device AI Explanations (`selectionReason` & `route.reason`) in the UI** *(PAIR Pattern: Explain for understanding, not completeness)*:
   - `packages/ai/src/pipeline.ts` already captures `analysis.selectionReason` (why Gemini Nano selected specific clauses) and `analysis.route.reason` (why Nano routed the question to local on-device answer vs cloud reasoning).
   - Showing `analysis.selectionReason` in `Review.tsx` and `analysis.route.reason` on `Answer.tsx` (as specified in `BRIEF.md` §4: *"Side cards: routing explanation"*) makes the on-device model's reasoning visible to judges without cluttering the UI.
2. **Calibrate the Review Screen When Routing is Local (`analysis.route.local === true`)** *(PAIR Pattern: Set the right expectations & Automate more when risk is low)*:
   - When `analysis.mode === 'private' && analysis.route.local` is `true`, `answer()` runs `answerLocal` on-device and sends **0 bytes** to the cloud. Showing a clear on-device routing notice in `Review` (or labeling the preview card accordingly) prevents a mental-model mismatch between Review ("What the cloud will see") and Answer ("0 cloud calls · 0 bytes left this computer").
3. **Structure Phase 5 (`tests/eval` & `docs/EVAL.md`) Around PAIR's Evaluation Framework** *(PAIR Chapter 2.3 & Pattern: Make precision and recall tradeoffs carefully)*:
   - Evaluate **Rules alone (Basic protection)** vs **Nano alone** vs **Envoy layered (Rules + Nano + Guard)** across 30–50 cases including **"noisy" data** (Arabic-Indic digits, unspaced IBANs, reformatted phones, multi-clause contracts).
   - Report **PII Leakage % (1 − Recall)**, **Excerpt Compression % (chars sent / total doc chars)**, **Schema Validity %**, and **On-Device Latency (ms)**.
4. **Use PAIR Vocabulary in `README.md`, `AboutDialog`, Video Script, and Devpost Text**:
   - Explicitly credit and reference the **Google PAIR People + AI Guidebook** alongside **PAPILLON (NAACL 2025)** and **Harness² (Google Research, 2026)**—showing judges that Envoy is built on Google's own research and human-centered AI design standards.
