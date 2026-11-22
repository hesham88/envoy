# Google PAIR Guidebook — Chapters 3–6, 23 Design Patterns & Worksheets Reference

Source: Extracted from the official **People + AI Guidebook (v2 / Generative AI edition)** at <https://pair.withgoogle.com/guidebook>.

---

## 1. Chapters 3–6 Breakdown (UX, Trust, Control, Errors)

### Chapter 3: Mental Models + Expectations (`/chapters/mental-models-and-expectations/`)
1. **Identify existing mental models** (`/identify-existing-mental-models/`): People form mental models for everything they interact with, but these may not match what a probabilistic AI product can actually do. Identify where user assumptions diverge from system reality and plan how to calibrate them.
2. **Introduce AI in stages** (`/introduce-ai-in-stages/`): Set expectations of AI regularly across the product lifecycle. Explain capabilities and limitations, how it behaves in different modes, and give users safe ways to explore and experiment.
3. **Plan for co-learning** (`/plan-for-co-learning/`): Reinforce healthy mental models by giving people tools to steer, adapt, and inspect the system so their intuition improves with use.
4. **Account for expectations of human-like interaction** (`/account-for-human-like-interaction/`): Distinguish between natural language usability and anthropomorphism. Avoid human-like persona cues when precision, predictability, and calibrated trust are the user's primary objectives.
- **Official Worksheets:**
  - *Existing vs. New Mental Models* (`existing-vs-new-mental-models.pdf`): Map existing user mental models, how your product breaks or reinforces them, and how the UI helps users update their mental model.
  - *Creating Onboarding* (`creating-onboarding.pdf`): Messaging framework to set up the interaction relationship, capabilities, and limits from first use.

### Chapter 4: Trust + Explanations (`/chapters/trust-and-explanations/`)
1. **Understand trust in the context of your product** (`/understanding-trust-in-your-product/`): Articulate the factors that build, calibrate, or break trust. Identify the specific risks of **over-trusting** (blind acceptance of errors/leaks) vs **under-trusting** (abandonment or tedious manual work).
2. **Calibrate trust throughout the product experience** (`/calibrated-trust-across-the-product-experience/`): Build the right level of trust before first use, during active review, and after output delivery (receipts, provenance badges, audit logs).
3. **Crafting helpful explanations for understanding and action** (`/crafting-helpful-explanations/`): Tailor explanations to the user's immediate decision so they can responsibly act on AI outcomes without technical overwhelm.
- **Official Worksheets:**
  - *Levers of Trust* (`levers-of-trust.pdf`): Map which levers of trust matter at critical moments and address trust-affirming vs distrust-affirming experiences.
  - *Calibrating Trust and Crafting Explanations* (`calibrating-trust-and-craft-explanations.pdf`): Identify situations where users could under-trust or over-trust your AI feature, design targeted explanations, and test whether users can act on them.

### Chapter 5: Feedback + Controls (`/chapters/feedback-and-controls/`)
1. **Align user feedback with model improvement** (`/align-user-feedback-with-model-improvement/`): Distinguish between explicit user feedback, implicit user signals, and system feedback that shapes user behavior.
2. **Design AI Feedback Loops** (`/design-ai-feedback-loops/`): Use explicit system feedback (direct explanations, guard alerts, receipts) to make the AI's process transparent, and implicit system feedback (visual state transitions, live previews) to help users steer the system.
3. **Offer control over the AI experience** (`/offer-control-over-the-ai-experience/`): Preserve user agency in automated workflows. Provide controls to configure, steer, edit, and approve AI outcomes before irreversible or high-stakes actions.

### Chapter 6: Errors + Graceful Failures (`/chapters/errors-and-graceful-failures/`)
1. **Understand "errors" & "failure"** (`/understand-errors-and-failure/`): Distinguish between **user errors**, **system/model errors**, and **alignment errors** (mismatches between system assumptions and user expectations). Evaluate real-world consequences of false positives vs false negatives.
2. **Identify sources of error** (`/identify-sources-of-errors/`): Trace errors across data/input formatting, model capability/availability limits, user edits, and multi-step system interactions; pair each source with a deterministic or UX mitigation.
3. **Provide paths forward from failure** (`/provide-paths-forward-from-failure/`): Match safety measures to the stakes of the situation. Use proactive error prevention (guards, pre-checks), clear communication, and non-automated takeover paths so users are never stranded.
- **Official Worksheets:**
  - *Errors Audit* (`errors-audit.pdf`): Proactively list critical moments, potential error modes, stakes, prevention guardrails, and graceful recovery paths.
  - *Quality Assurance* (`quality-assurance.pdf`): Structured plan for monitoring errors, guard triggers, and fallback rates.

---

## 2. The 23 Official PAIR Design Patterns (`pair.withgoogle.com/guidebook/patterns`)

| # | Pattern Title & Anchor | Official Summary | Aim For / Avoid |
| --- | --- | --- | --- |
| 1 | **Determine if AI adds value** (`#determine-if-ai-adds-value`) | Confirm AI uniquely improves the user experience over heuristics or manual controls. | **Aim For:** Use AI where predictive/semantic capability creates value that couldn't exist without it.<br>**Avoid:** Using AI where deterministic rules or manual controls are safer and more predictable. |
| 2 | **Set the right expectations** (`#set-the-right-expectations`) | Be transparent with users about what your AI-powered product can and cannot do. | **Aim For:** Clarify the AI's limitations, especially in high-stakes situations.<br>**Avoid:** Suggesting the tech works perfectly in high-stakes situations when it is probabilistic. |
| 3 | **Explain the benefit, not the technology** (`#explain-the-benefit-not-the-technology`) | Help users understand your product's capabilities rather than what's under the hood. | **Aim For:** Emphasize how the app benefits users.<br>**Avoid:** Leading with underlying ML jargon in primary user flows. |
| 4 | **Be accountable for errors** (`#be-accountable-for-errors`) | Understand the types of errors users might encounter and have a plan for resolving them. | Plan early for false positives, false negatives, and availability failures based on what is at stake for the user. |
| 5 | **Invest early in good data practices** (`#invest-early-in-good-data-practices`) | Better data planning and evaluation prevents downstream "data cascades." | Collect data in batches, embrace noisy data, plan for maintenance, and involve domain knowledge early. |
| 6 | **Make precision and recall tradeoffs carefully** (`#make-precision-and-recall-tradeoffs-carefully`) | Decide whether to prioritize broader coverage (recall) or higher certainty (precision) based on stakes. | In high-stakes safety/privacy detection, optimize recall so critical items are not missed, and let users review borderline items. |
| 7 | **Be transparent about privacy and data settings** (`#be-transparent-about-privacy-and-data-settings`) | From initial onboarding through ongoing use, communicate clearly about data boundaries and controls. | **Aim For:** Communicate what data is kept vs shared, and give users direct control over their preferences. |
| 8 | **Make it safe to explore** (`#make-it-safe-to-explore`) | Let users test-drive the system with low-stakes sample data and easily reversible actions. | Offer an initial experimentation experience before users must commit their own sensitive data. |
| 9 | **Anchor on familiarity** (`#anchor-on-familiarity`) | Guide users with familiar UI touchpoints rather than inventing unfamiliar "AI magic" metaphors. | Familiar patterns let users focus on calibrating trust in the system's output rather than learning a novel UI. |
| 10 | **Add context from human sources** (`#add-context-from-human-sources`) | Help users appraise outputs with domain context, citations, or explicit clause references. | Cite the exact source clause or rule that produced an output so the user can verify it immediately. |
| 11 | **Determine how to show model confidence, if at all** (`#determine-how-to-show-model-confidence-if-at-all`) | Only show confidence in a way that helps users make a decision. | Prefer actionable tiers (e.g., auto-masked vs "flagged to check") over raw numeric percentages when numbers add cognitive load. |
| 12 | **Explain for understanding, not completeness** (`#explain-for-understanding-not-completeness`) | Give users the exact information they need in the moment rather than a full system dump. | **Aim For:** Expose aspects that impact user trust and decision-making.<br>**Avoid:** Explaining the entire system mid-flow when a one-line rationale suffices. |
| 13 | **Go beyond in-the-moment explanations** (`#go-beyond-in-the-moment-explanations`) | Offer deeper explanations outside immediate product flows for users and auditors who want them. | Use About dialogs, architecture tables, and inspectable logs (`?inspect=1`) outside the primary task path. |
| 14 | **Automate more when risk is low** (`#automate-more-when-risk-is-low`) | Consider user trust and the stakes of the situation when determining how much to automate. | **Aim For:** Be more proactive with automation when failure/privacy risk is zero or low.<br>**Avoid:** Automating without user control in high-stakes situations. |
| 15 | **Let users give feedback** (`#let-users-give-feedback`) | Give users the opportunity for real-time teaching, feedback, and error correction. | **Aim For:** Acknowledge user edits/overrides immediately in the live output.<br>**Avoid:** Collecting dead-end feedback with no visible effect. |
| 16 | **Let users supervise automation** (`#let-users-supervise-automation`) | Maintaining control over automation helps users build comfort and correct when things go wrong. | **Aim For:** Enable users to review and approve options before execution.<br>**Avoid:** Automating high-stakes actions without review or undo. |
| 17 | **Automate in phases** (`#automate-in-phases`) | Progressively increase automation under user guidance and across capability tiers. | Support both manual/rule-based supervision (Basic protection) and AI-assisted minimization (Private mode). |
| 18 | **Give control back to the user when automation fails** (`#give-control-back-to-the-user-when-automation-fails`) | Give users a clear way to move forward even when the model fails or is unavailable. | Provide: 1) Awareness of the situation, 2) What they need to do next, and 3) How to take their next action manually. |
| 19 | **Design for your data labelers** (`#design-for-your-data-labelers`) | Ensure ground-truth creation and human rating sheets have clear instructions and low-friction tools. | Keep manual eval rating sheets simple, unambiguous, and well-structured. |
| 20 | **Actively maintain your dataset** (`#actively-maintain-your-dataset`) | Proactively maintain evaluation and test datasets as prompts and models evolve. | Version test cases alongside prompt versions (`PROMPT_VERSION`). |
| 21 | **Learn from label disagreements** (`#learn-from-label-disagreements`) | Investigate edge cases where rules, models, or human raters disagree rather than discarding them. | Disagreements between rule detectors and LLM entity extraction reveal prompt or regex boundary bugs. |
| 22 | **Embrace "noisy" data** (`#embrace-noisy-data`) | Real-world user inputs are messy; include realistic formatting noise in test and eval sets. | Include spacing variations, punctuation noise, non-ASCII digits (`٠–٩`), and multi-clause distractors. |
| 23 | **Get input from domain experts as you build your dataset** (`#get-input-from-domain-experts-as-you-build-your-dataset`) | Ground datasets and schemas in real domain artifacts and realistic workflows. | Base contracts, IDs, IBANs, and clauses on authentic structural rules (with fictional entities). |
