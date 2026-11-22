# Google PAIR Guidebook — Chapters 1–2 & Evaluation Worksheets Reference

Source: Extracted from the official **People + AI Guidebook (v2 / Generative AI edition)** at <https://pair.withgoogle.com/guidebook>.

---

## 1. Chapter 1: User Needs + Defining Success (`/chapters/user-needs-and-defining-success/`)

### Sub-chapters
1. **Identify User Needs & AI Strengths** (`/identify-user-needs-and-ai-strengths/`): Solve a real problem in which AI adds unique value. Understand the nature of the problem and how people experience it. Evaluate different AI systems to find the intersection where user needs meet AI strengths—and use deterministic code where heuristics are superior.
2. **Balance Automation & Augmentation** (`/balance-automation-and-augmentation/`): Understand the conditions under which people prefer automation (repetitive scanning, tedious extraction, low-risk local lookups) versus augmentation (high-stakes sharing decisions, reviewing and editing what leaves the device).
3. **Define Interaction Design Policies** (`/define-interaction-design-policies/`): Generative AI products are characterized by flexible and open-ended user journeys. Create interaction design policies to control how your AI product responds to different inputs at critical moments, and allow people to safely navigate model outcomes.
4. **Prepare for Potential Pitfalls** (`/prepare-for-potential-pitfalls/`): Look for signals that help you anticipate and plan for future change or failure modes (e.g., missing browser APIs, SDK fallback bugs, reformatted PII in manual user edits, offline usage).

### Official Chapter 1 Worksheets
- **Evidence of User Need** (`evidence-of-user-need.pdf`): Align the team on whether AI is a solution worth pursuing and why traditional software alone is insufficient.
- **Specify and Align the AI Problem** (`specify-and-align-the-ai-problem.pdf`): Define the purpose of each AI step to align its behavior with user intentions.
- **Automation vs. Augmentation** (`automation-vs-augmentation.pdf`): Validate which steps should be automated vs human-supervised.
- **Create Interaction Design Policies** (`create-interaction-design-policies.pdf`): Define hard behavioral rules for how the product responds to inputs and model outputs at critical safety/privacy moments.
- **Design Your Reward Function** (`design-your-reward-function.pdf`): Evaluate the user consequences of false positives and false negatives to decide whether each step must optimize for **Precision** or **Recall**.
- **Define Your Success Criteria** (`define-your-success-criteria.pdf`): Map UX requirements, ML/model requirements (accuracy, leakage, latency), and unacceptable actions/vulnerabilities (e.g., silent cloud fallback of raw document text).

---

## 2. Chapter 2: Data & Model Evolution (`/chapters/data-and-model-evolution/`)

### Sub-chapters
1. **Define your AI and data requirements** (`/ai-requirements/`): Translate user needs into specific data and model requirements by creating and analyzing prototypical data (e.g., multi-page contracts, employment offers, medical/lab summaries with structured and unstructured PII). Avoid downstream "data cascades" through upfront schema design.
2. **Prepare your data for AI** (`/prepare-your-data-for-ai/`): Decide how to combine synthetic/fictional benchmark data with realistic formatting noise. Never include real personal data in repositories or evaluation sets; construct structurally valid fictional entities (mod-97 IBANs, Luhn test cards, valid-structure fictional national IDs).
3. **Evolve AI with evaluation** (`/evolve-ai-with-evaluation/`): Develop a holistic AI evaluation strategy that starts with **user benefits** (zero PII leakage, minimal excerpt size, accurate restored answers), not just isolated technical metrics. Navigate trade-offs between speed vs thoroughness and safety vs utility. Use **disaggregated analysis** (comparing rules-only, model-only, and layered hybrid across clean vs noisy inputs) to prioritize improvements via prompt refinement, schema constraints, or deterministic guards.

---

## 3. Envoy Evaluation Matrix Template (for `docs/EVAL.md` and `README.md`)

Use this PAIR-aligned disaggregated evaluation table when reporting `npm run eval` results:

| Configuration | PII Leakage % (Lower is better; 0% required) | Clauses Sent / Total Clauses | Chars Sent / Total Chars (Compression) | Schema-Valid JSON % | Median On-Device Latency |
| --- | --- | --- | --- | --- | --- |
| **Rules only (Basic protection)** | Measured on `tests/eval/cases.json` | 100% (all clauses, masked; user selects) | ~100% (masked) | n/a (deterministic) | < 5 ms |
| **Gemini Nano only (Unlayered)** | Measured on `tests/eval/cases.json` | ~1–2 clauses / doc | ~10–20% | Measured % | Measured ms |
| **Envoy Layered (Rules + Nano + Outbound Guard)** | **0.0%** (enforced by `checkOutbound`) | ~1–2 clauses / doc | ~10–20% | 100% (with safe fallback) | Measured ms |
