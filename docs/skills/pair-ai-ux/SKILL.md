---
name: pair-ai-ux
description: "Human-centered AI UX design and review skill based on Google PAIR's People + AI Guidebook (https://pair.withgoogle.com/guidebook, Chapters 3–6 and 23 Design Patterns). Use when designing, building, auditing, or polishing AI interfaces, onboarding, mental models, explainability, calibrated trust, confidence indicators, human-in-the-loop review gates, user feedback/control loops, or graceful fallback/error states. Triggers - 'PAIR', 'pair guidebook', 'human-centered AI', 'calibrated trust', 'explainability', 'AI onboarding', 'supervise automation', 'graceful failure', 'AI UX audit', 'mental model'."
---

# Google PAIR Guidebook — Human-Centered AI UX (`pair-ai-ux`)

Source: **Google People + AI Research (PAIR) Guidebook (v2 / Generative AI edition)** — <https://pair.withgoogle.com/guidebook> (Chapters 3–6: *Mental Models & Expectations*, *Trust & Explanations*, *Feedback & Controls*, *Errors & Graceful Failures*, plus the 23 Design Patterns). For problem framing, interaction design policies, precision/recall trade-offs, and dataset/eval design (Chapters 1–2), use [`../pair-ai-eval/SKILL.md`](../pair-ai-eval/SKILL.md). For deep chapter and pattern tables, read [`./references/patterns-and-worksheets.md`](./references/patterns-and-worksheets.md).

## Core Principles

### 1. Calibrate trust — never maximize blind trust
Users should trust the AI **precisely when it is reliable** and inspect or override it when stakes are high or confidence is lower. Both **over-trust** (blindly sending unreviewed outputs in a high-stakes domain) and **under-trust** (abandoning the tool because it feels opaque) are design failures.

| Stage | How to Calibrate Trust in the UI |
| --- | --- |
| **Before action (Onboarding / Start)** | State what runs where, what the boundaries are, and offer a **zero-risk sandbox** (*Make it safe to explore*: one-click sample document + suggested prompts) before asking for real data. |
| **During decision (In-the-moment / Review)** | Expose the exact factors that affect the user's decision (*Explain for understanding, not completeness*): what was detected, which clauses were selected and **why** (one sentence), and the exact payload that will leave the device. |
| **After action (Receipt / Answer)** | Show provenance: which parts came from the cloud vs on-device vs deterministic code, a verifiable receipt (counts, timings, inference source), and clear domain limits (e.g., *"This explains your document; it isn't legal advice"*). |
| **Outside the core flow** | *Go beyond in-the-moment explanations*: keep deep architecture tables, inference modes, failure disclosures, and live payload inspectors (`AboutDialog`, `NetworkInspector`) one click away without cluttering the primary task. |

### 2. Mental Models: Instrument, not Persona
*PAIR Chapter 3.4: Account for expectations of human-like interaction & Pattern: Anchor on familiarity*
- **Avoid harmful anthropomorphism** in high-stakes or privacy/utility tools: do not use first-person `"I"` (*"I read your contract and I think…"*), chat avatars, or "magic AI sparkles." Anthropomorphism inflates expectations of human judgment and causes sharp trust collapse on edge cases.
- **Design an instrument:** use clear third-person or passive-instrumental labels (*"Selected by on-device AI"*, *"Restored on your device from `[RENT]`"*, *"Worked out on your device from `{{RENT * 1.10}}`"*).
- **Anchor on familiarity:** build on familiar metaphors (document highlighters, checkboxes, itemized receipts, redaction chips) rather than inventing alien UI controls.

### 3. Explainability & Confidence Indicators
*PAIR Patterns: Explain the benefit, not the technology · Explain for understanding, not completeness · Determine how to show model confidence, if at all*
- **Lead with user benefit, not plumbing:** hero and primary action copy must state the user outcome (*"Ask the cloud. Keep your secrets."*), while technical mode badges (`On-device`, `Cloud · only if needed`) provide scannable verification.
- **Show actionable confidence tiers, not raw probabilities:** never dump raw floats like `0.85` or `0.40` into end-user UI unless the user can act on the number. Translate confidence into **actionable states**:
  - High confidence (checksummed rules, verified spans) → applied automatically, toggleable on click.
  - Lower confidence (heuristic name candidates in fallback mode) → applied safely by default, grouped into an explicit **"Names to check"** callout.
- **Never use color alone:** every device/cloud/warning state must pair color with an icon and explicit text label, meeting WCAG AA contrast in light and dark themes.

### 4. Supervising Automation & User Control
*PAIR Patterns: Automate more when risk is low · Let users supervise automation · Give control back to the user*
- **Match automation to risk:**
  - **Low/zero privacy risk** (e.g., on-device local answer where 0 bytes leave the machine): automate smoothly and celebrate the zero-network path (`0 cloud calls · 0 bytes left this computer`).
  - **High stakes** (sending an excerpt of a private document to the cloud): pause at an explicit **Review & Approve** gate.
- **Provide layered, low-friction overrides:**
  1. **One-click inline correction** (click any highlighted span to cycle `masked → hidden → shared`).
  2. **Scope control** (check/uncheck document clauses/sections).
  3. **Direct manual edit** (editable outbound text area with real-time guardrail re-validation).

### 5. Errors & Graceful Failure
*PAIR Chapter 6 & Patterns: Be accountable for errors · Give control back to the user when automation fails*
Every error, unavailable model state, or guardrail block must give the user **three things**:
1. **Awareness of the situation** (what state the system is in right now, e.g., `Basic protection` or `Offline` or `Blocked before sending`).
2. **Why it happened** in plain language (e.g., *"Your on-device model is still downloading, so this run uses Basic protection"* or *"The excerpt still contains a bank account (IBAN)"*).
3. **An immediate path forward** that never traps the user or silently violates safety/privacy (e.g., deterministic local rules + manual clause selection, a 3-step `Turn on on-device AI` guide with a live `Check again` button, or an offline lighter on-device answer labeled as such).

---

## PAIR UX Audit Format (Required When Reviewing UI)

When auditing a screen, component, or flow with `pair-ai-ux`, output a markdown table with **Component / Flow**, **PAIR Pattern / Chapter**, **Before (Gap)**, **After (Fix)**, and **Impact on Calibrated Trust**:

| Component / Flow | PAIR Pattern / Chapter | Before (Gap) | After (Fix) | Impact on Calibrated Trust |
| --- | --- | --- | --- | --- |
| Clause selection in `Review.tsx` | *Explain for understanding, not completeness* (Ch. 4) | Selected clauses are outlined, but `analysis.selectionReason` is not rendered | Show the one-line `selectionReason` under the question or selected clause header | Users and judges immediately see *why* the on-device model chose Clause 7 |
| Local-routed question in `Review.tsx` | *Set the right expectations* / *Automate more when risk is low* (Ch. 3, 5) | Header always says `"What the cloud will see"` even when `route.local === true` | Indicate when a question will be answered **on-device with 0 cloud calls** (`route.reason`) | Eliminates mental-model mismatch between Review and the `0 cloud calls` Answer card |
| Fallback mode in `FoundList.tsx` | *Determine how to show model confidence, if at all* (Ch. 4) | Showing raw `confidence: 0.4` or hiding uncertainty | Group `0.4` heuristic matches under `"Names to check (masked by default)"` | Users calibrate scrutiny to the exact items that need human verification |

## Quick Checklist Before Shipping Any AI UI Change

- [ ] **Safe to explore:** Can a first-time user or judge experience the core AI value in one click with sample data?
- [ ] **Calibrated expectations:** Does every screen make clear whether work happened on-device (`--device` green + icon + label), in the cloud (`--cloud` blue + icon + label), or via deterministic rules?
- [ ] **In-the-moment rationale:** Are the model's one-line selection/routing reasons surfaced where the user makes a decision?
- [ ] **Supervised automation:** Can the user override entity masking, clause selection, and raw outbound text before any cloud call, with live guardrail re-checking?
- [ ] **Graceful fallback:** If the model is missing, downloading, crashes, or offline, does the flow still complete safely with zero silent leaks and a clear notice?
- [ ] **Instrument voice:** Is all copy free of first-person AI anthropomorphism (`"I"`), marketing fluff, and decorative AI sparkles?
