# Envoy — Empirical Security, Privacy & Utility Evaluation

*Argon Eval Lane (`tests/eval/**`, `docs/EVAL.md`, `packages/cli/**`). Every number below comes from real runs via `scripts/lib/envoy-browser.mjs` (`analyze()` / `answer()` through Firebase AI Logic hybrid inference in Chrome), real in-browser Firebase AI Logic SDK `ONLY_IN_CLOUD` calls (`tests/eval/lib/browser-sdk.mjs`), or `@envoy/core` / `@envoy/cli` deterministic evaluators, stating exact model (`component` + `version`), date, and `n`. Machine-readable contract for the landing page & README: [`tests/eval/summary.json`](../tests/eval/summary.json) (now with per-metric `metricsN`).*

---

## 1. Method & One-Command Reproduction

- **Pipeline execution (`tests/eval/collect-live.mjs`):** Uses `scripts/lib/envoy-browser.mjs` (`connectEnvoyPage`, `runCase`) bootstrapped with Firebase Remote Config + `cloudModelOverride()` (`tests/eval/lib/browser-sdk.mjs`), calling the real `@envoy/ai` `analyze()` and `answer()` through Firebase AI Logic hybrid inference with the 4-layer device guard. Nothing is recomposed outside `analyze()`/`answer()`, and no model output is ever synthesized.
- **In-browser Firebase AI Logic SDK cloud calls (`tests/eval/run-attacks.mjs`, `tests/eval/run-quality.mjs`):** Run inside a real Chromium browser page via `getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: settings.cloudModel, ... } })` with Remote Config `cloud_model` / `VITE_CLOUD_MODEL` (`gemini-3.5-flash-lite`) and App Check.
- **Reproduce offline from a clean checkout (no Chrome needed — uses committed live caches):**
  ```bash
  npm run eval
  ```
- **Re-collect live arms / SDK attacks / real answers:**
  ```bash
  npm run eval -- --live --arm basic --port 5174 --with-answer
  node tests/eval/run-attacks.mjs --all --limit 36 --port 5174
  node tests/eval/run-quality.mjs --all --limit 20 --port 5174
  ```

---

## 2. Full Measured Pipeline Matrix — All 3 Arms (`FULL n = 36 / 36`, `2026-11-22`)

All three arms were measured live on **`2026-11-22`** across all **36 benchmark cases (`263` gold sensitive entities)** via `scripts/lib/envoy-browser.mjs`:
- **`nano` (Default Gemini Nano — what ordinary Chrome judges receive):** `nano_v3_cpu_component` `2025.8.21.1028`, CPU backend (`OnDeviceModelForceCpuBackend`), **`36/36` Private, `0` fallbacks**.
- **`gemma4` (Gemma 4 developer trial):** `gemma4_component` `2026.11.3.1140`, CPU backend (`OnDeviceModelForceCpuBackend` + `gemma4-for-built-in-ai`), **`36/36` Private, `0` fallbacks**.
- **`basic` (Fallback when on-device model is unavailable):** Rules + Guard + Name Flags in headless Chromium (`LanguageModel` unavailable), **`36/36`**.

| Arm | Model (`component version`) | Backend | Date | `n / 36` | Mask Recall | False-Mask Rate | Outbound Leaks *(post-guard)* | Clause Acc | Min Ratio *(sent / doc)* | Latency `p50 / p95` |
| --- | --- | --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`nano`** | **Gemini Nano (default)** (`nano_v3_cpu_component 2025.8.21.1028`) | CPU (`OnDeviceModelForceCpuBackend`) | `2026-11-22` | **36 / 36** | **100.00%** *(263 / 263)* | 20.5% | **0** | **83.3%** *(30 / 36)* | **8.4%** *(**91.6% reduction**)* | **66,978 ms / 154,011 ms** |
| **`gemma4`** | **Gemma 4** (`gemma4_component 2026.11.3.1140`) | CPU (`OnDeviceModelForceCpuBackend`) | `2026-11-22` | **36 / 36** | **100.00%** *(263 / 263)* | 18.1% | **0** | **88.9%** *(32 / 36)* | **21.9%** *(**78.1% reduction**)* | **54,951 ms / 78,361 ms** |
| **`basic`** | *None* (`LanguageModel` unavailable) | rules + guard + name flags | `2026-11-22` (post-PR #17) | **36 / 36** | **100.00%** *(263 / 263)* | 10.9% | **0** *(was 8)* | 100.0% *(all clauses)* | 90.2% | **6 ms / 32 ms** |

### Basic protection leaks: found, fixed, re-measured ([Issue #7](https://github.com/hesham88/envoy/issues/7))
The initial Basic run leaked **8 person names across 7 cases** (5 hyphenated Arabic surnames `El-*` and 3 names preceded by role words like `"Landlord Karim Fathy"`). **PR #17** fixed both patterns in `packages/core/src/names.ts`; re-running all 36 Basic cases through the real pipeline brought leaks to **0 (`263 / 263` masked)** and lowered false masks from `13.3%` to `10.9%`.

---

## 3. Privacy Attacks & Guard Hardening

### 3.1 & 3.2 Re-Identification & Attribute Inference (`FULL n = 36 / 36`, In-Browser Firebase AI Logic SDK)
- **Runner:** `tests/eval/run-attacks.mjs` (`tests/eval/lib/browser-sdk.mjs` + `sdk-bridge.mjs`).
- **Attacker model & transport:** Cloud **`gemini-3.5-flash-lite`** called **inside Chromium via the Firebase AI Logic SDK** (`getGenerativeModel` with `InferenceMode.ONLY_IN_CLOUD`, Remote Config `cloud_model` / `VITE_CLOUD_MODEL`, and App Check; `inferenceSource === 'in_cloud'` asserted on every call), date **`2026-11-22`**, **`n = 36 / 36`** (`263` gold sensitive entities · `77` ground-truth attributes: city, gender, employer/org, salary/amount band · `114` live SDK calls cached with `source: 'live'`).

| Observed Input Given to Cloud Adversary (`gemini-3.5-flash-lite` via Firebase AI Logic SDK `ONLY_IN_CLOUD`, `2026-11-22`, `n = 36 / 36`) | Exact Re-ID % | Partial + Exact Re-ID % | Attribute Inference % |
| --- | :---: | :---: | :---: |
| **Envoy (`nano`: Default Gemini Nano `nano_v3_cpu_component 2025.8.21.1028`)** | **0.0%** *(0 / 263)* | **0.0%** | **0.0%** *(0 / 77)* |
| **Envoy (`gemma4`: Gemma 4 `gemma4_component 2026.11.3.1140`)** | **0.0%** *(0 / 263)* | **0.0%** | **0.0%** *(0 / 77)* |
| **Envoy (`basic`: Rules + Guard + Name Flags, full doc)** | **0.0%** *(0 / 263)* | **0.0%** | **3.9%** *(3 / 77)* |
| **Baseline: `[REDACTED]` everywhere (full doc)** | 1.5% *(4 / 263)* | 1.5% | 6.5% *(5 / 77)* |
| **Ceiling: Raw Unmasked Document** | **85.5%** *(225 / 263)* | **87.5%** | **67.5%** *(52 / 77)* |

> **Finding:** Across all **36 / 36** cases (`263` gold entities, `77` attributes), naive `[REDACTED]`-everywhere over the full document still leaks **1.5% (`4 / 263`)** exact values and **6.5% (`5 / 77`)** hidden attributes from surrounding context. **Both on-device Envoy arms (`nano` and `gemma4`) drive exact re-identification, partial re-identification, AND attribute inference to `0.0%` (`0 / 263` and `0 / 77`) — strictly beating `[REDACTED]`-everywhere.**

### 3.3 Outbound Guard Red-Team (`tests/eval/redteam.json`, `tests/eval/run-redteam.mjs`)
- **Target:** `@envoy/core` `checkOutbound()` (`packages/core/src/guard.ts` + `guard-variants.ts`) · **Date:** `2026-11-22` · **Cases:** `28` adversarial bypass payloads + `10` false-positive controls (ordinary lease prose with number words, non-protected spelled-out numbers, binary SHA-256 Base64 digest, reversible English words, multi-line substring overlap `"Simona\nAdelaide"` vs `"Mona Adel"`, real multi-line masked lease clauses, short digit-word runs, hyphenated line-wrapped prose).

| Stage | Attacks Blocked | Bypasses | Controls Clean | False Blocks |
| --- | :---: | :---: | :---: | :---: |
| Initial baseline (Issue #7) | `11 / 28` (39.3%) | `17` | `2 / 2` | `0` |
| After PR #11 (ZWSP, homoglyphs, full-width) | `17 / 28` (60.7%) | `11` | `2 / 2` | `0` |
| After PR #14 (NFD accents, defanged email, spaced tokens) | `20 / 28` (71.4%) | `8` | `2 / 2` | `0` |
| **After PR #22 + Milestone 3 controls (current `main`)** | **`28 / 28` (100.0%)** | **`0`** | **`10 / 10`** | **`0`** |

- **PR #22 closed all 8 remaining bypasses (`packages/core/src/guard-variants.ts`, `packages/core/src/guard-redteam.test.ts`):** the guard now also reads the text with number words folded into digits (`rt-10`–`rt-12`), with a word split across lines joined (`rt-14`), reversed (`rt-19`, `rt-20`), and with Base64 blobs decoded (`rt-17`, `rt-18`). It **fails closed** on encoded text: a Base64 blob that decodes to readable ASCII text is blocked even when nothing protected is found inside it (because the reviewer cannot read it either), while non-readable binary digests (e.g., SHA-256 in `rt-ctrl-05`) and all 10 false-positive controls pass with `0` false blocks.

### 3.4 Secrets & CustomRule Evaluation (`tests/eval/run-secrets.mjs`)
- **Target:** `@envoy/core` `scanText()` (`SECRET` + `CustomRule`) · **Date:** `2026-11-22` · **Cases:** `n = 24` (`16` runtime-constructed key-shaped positives + `8` negative controls; zero secret literals committed).
- **Measured result:** **`100.0%` Recall (`16 / 16`)**, **`94.1%` Precision (`16 / 17`)**, **`6 / 6` CustomRule tests passing**.
- **1 open precision finding ([Issue #7](https://github.com/hesham88/envoy/issues/7)):** `neg-07-env-template-empty` (`VITE_FIREBASE_API_KEY=\nAUTH_TOKEN=""`) matches across `\n`.

---

## 4. Answer Quality vs. Privacy — Real `runCase({ withAnswer: true })` (Milestone 1)

- **Method:** Every Envoy answer graded here is the **verbatim `result.answer.text`** returned by `@envoy/ai` `answer()` during a live browser `runCase({ withAnswer: true })` run — **no regenerated answers and no extra prompt lines**. If the real product's `checkOutbound()` blocked sending (`OutboundBlockedError`), that question is scored honestly as `0.0` (`guard_blocked`, unattended) because the user receives no automatic answer until they manually uncheck the false-flagged heading in the Review screen.
- **Judge & raw-document ceiling:** Separate cloud judge **`gemini-3.5-flash-lite`** running inside Chromium via the **Firebase AI Logic SDK (`InferenceMode.ONLY_IN_CLOUD` + App Check)** · **Date:** `2026-11-22`.

| Arm *(Measured `2026-11-22`, judge `gemini-3.5-flash-lite` via Firebase AI Logic SDK `ONLY_IN_CLOUD`)* | `n` | Sources *(device / cloud / guard-blocked)* | Unblocked Score | **Overall Envoy Score (unattended)** | Raw-Doc Ceiling | **Answer Quality Retained** | Right Clause Cited % | Correct / Partial / Wrong |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`nano`** (`nano_v3_cpu_component 2025.8.21.1028`) | **18** | `10 / 3 / 5` | **92.3%** *(12 / 13)* | **66.7%** *(12 / 18)* | 100.0% | **66.7%** | 66.7% | `12 / 0 / 6` |
| **`basic`** (Rules + Guard + Name Flags) | **20** | `0 / 15 / 5` | **100.0%** *(15 / 15)* | **75.0%** *(15 / 20)* | 100.0% | **75.0%** | 75.0% | `15 / 0 / 5` |
| **`gemma4`** (`gemma4_component 2026.11.3.1140`) | **0** | *not collected with `withAnswer`* | — | — | — | `null` | — | — |

> **Honest drop from the prior `n = 10` regenerated estimate (`100%` → `66.7%` Nano / `75.0%` Basic) — two real product causes uncovered:**
> 1. **5 / 20 unattended `OutboundBlockedError` blocks on both arms** (`offer-04`, `offer-05`/`offer-01`, `med-01`, `freelance-01`, `loan-01`): `flagNames()` flagged Title-Case headings (`"Base Salary"`, `"Referring Physician"`, `"Milestone Fee"`, `"Principal Balance"`, `"Without Cause"`) as `PERSON` entities, and `checkOutbound()` then blocked lowercase mentions of those exact phrases in the body text until the user clears them in the Review screen.
> 2. **1 / 10 on-device local answer miss on `nano`** (`offer-02-non-compete-scope`): Default Gemini Nano routed a nuanced non-compete interpretation locally (`local: true`), and `answerLocal` replied *"the document does not say"* even though Clause 4 explicitly permitted non-financial software (healthcare). All `3 / 3` (`100%`) cloud-routed masked Nano answers and `9 / 10` (`90.0%`) local Nano answers were graded correct. *(2 of the 20 Nano runs — `offer-01` (`OutboundBlockedError` on re-run) and `freelance-03` (1 transient `InvalidStateError` on the 19th consecutive CPU run) — had no stored `answer` and are excluded from `n = 18`.)*

---

## 5. Recorded On-Device Demo Traces for Judges (Milestone 4)

For judges without an on-device model, two verbatim `analyze()` + `answer()` recordings of the official Cairo sample lease (`"Can my landlord raise the rent 20% this year?"`) are committed under `tests/eval/probes/` (never edited or synthesized; clearly marked `"recording": true`):

| File | On-Device Model (`component version`) | Cloud Model | Recorded At | Mode / Selected / Route | Guard / Outbound Chars | Answer Source & Latency |
| --- | --- | --- | :---: | :---: | :---: | :---: |
| [`demo-trace-nano.json`](../tests/eval/probes/demo-trace-nano.json) | **Gemini Nano (default)** (`nano_v3_cpu_component 2025.8.21.1028`) | `gemini-3.5-flash-lite` | `2026-11-22T21:51:05Z` | `private` · Clause `[7]` · `local: false` | clean · `240` chars | `in_cloud` (`2,115 ms`) |
| [`demo-trace-gemma4.json`](../tests/eval/probes/demo-trace-gemma4.json) | **Gemma 4** (`gemma4_component 2026.11.3.1140`) | `gemini-3.5-flash-lite` | `2026-11-22T22:53:56Z` | `private` · Clause `[7]` · `local: false` | clean · `235` chars | `in_cloud` (`2,114 ms`) |

Both traces include `steps` (`step`, `source`, `ms`), `selectedIds`, `selectionReason`, `route` (`local`, `reason`), `outbound`, `receipt`, `answer` (`text`, `spans`, `source`, `lighter`, `ms`, `receipt`), `model` (`component`, `version`, `label`), `network`, and `recordedAt`.

---

## 6. `envoy-guard` CLI Hook & Evaluation (`packages/cli`, Milestone 5)

- **Package:** `@envoy/cli` (`packages/cli/dist/cli.mjs` → bin `envoy-guard`), rules-only **Basic protection** using `@envoy/core` `scanText()` + `~/.envoy/rules.json` (`CustomRule[]`). Makes zero network calls and **blocks** offending prompts/tool inputs with a ready-to-paste masked copy rather than rewriting them inline.
- **Verified agent hook contracts (`2026-11-22`):**
  - **Claude Code:** `UserPromptSubmit` (`decision: "block"` + masked copy; documents that Claude Code cannot rewrite prompts inline) and `PreToolUse` (`WebFetch|Bash|Write|Edit` → `permissionDecision: "deny"`).
  - **Gemini CLI:** `BeforeAgent` and `BeforeTool` (`web_fetch|run_shell_command|write_file|replace` → strict JSON `{"decision": "deny"|"allow"}`).
- **Tested `envoy-guard init claude|gemini`:** Unit-tested (`packages/cli/src/hook.test.ts`, **9 / 9 passing**) and binary-verified (`packages/cli/dist/cli.mjs init claude|gemini`) — prints valid `settings.json` JSON to stdout and Basic-protection guidance to stderr without editing user files.
- **CLI Eval Case Set (`tests/eval/run-cli.mjs`, `2026-11-22`):** **`n = 24`** realistic Claude Code & Gemini CLI prompts and tool inputs (`14` positives with runtime-constructed `SECRET` tokens, PII, and `CustomRule[]` codenames/ticket regexes; `10` clean coding-agent controls including tech terms, git SHAs, UUIDs, read-only tools, and word-boundary controls):
  - **Recall:** **`100.0%`** (`14 / 14`) · **Precision:** **`100.0%`** (`14 / 14`) · **False blocks:** **`0`** · **Raw-value echoes in stdout:** **`0`** · **Hook contract failures:** **`0`**.

---

## 7. `summary.json` `metricsN` Contract & Known Limitations

Every arm in [`tests/eval/summary.json`](../tests/eval/summary.json) now publishes per-metric sample sizes so the landing page never hides or conflates `n`:
```json
"metricsN": {
  "maskRecall": 36,
  "falseMaskRate": 36,
  "outboundLeaks": 36,
  "clauseAccuracy": 36,
  "latencyMs": 36,
  "minimizationRatio": 36,
  "reid": 36,
  "attribute": 36,
  "answerQuality": 18
}
```

### Limitations
1. **CPU latency on 2018 laptop hardware (`i7-8750H`, CPU-only backend because 2016 Pascal GTX 1050 Ti crashes Dawn):** `p50` is `54.9s` (`gemma4`) / `67.0s` (`nano`); GPU-backed systems should be much faster, but we have not measured one, so no GPU figure is claimed.
2. **The red team is 28 cases + 10 false-positive controls.** All 28 are blocked today with 0 false blocks, but 28 cases are not proof against every encoding or paraphrase. Envoy's claim is the measured one: it minimizes what leaves, masks what it detects, and blocks detected leaks, including disguised ones. Indirect identification is measured separately by the 36-case attribute-inference attack (section 3).
3. **Title-Case heading false flags in `flagNames()` (`5 / 20` unattended `OutboundBlockedError` blocks):** Both `nano` (`detectScope: 'selected'` runs `flagNames` on unselected clauses) and `basic` false-flag headings such as `"Base Salary"` and `"Without Cause"` as `PERSON`, blocking send until a user clears them in the Review screen. Fixing `flagNames()` heading stopwords is the #1 high-leverage utility improvement for the next core pass.
4. **`gemma4` real `answer()` quality not collected (`metricsN.answerQuality = 0`):** Milestone 1 focused real `runCase({ withAnswer: true })` quality collection on Default Gemini Nano (`nano`, `n = 18`) and Basic (`basic`, `n = 20`); `gemma4`'s `answerQualityRetained` is honestly `null` rather than estimated.

---

## Appendix A — Oracle Model (Upper Bound) *(Synthetic Gold Ceiling — NOT a Real Model)*

*Computed purely in-memory by `tests/eval/run.mjs` from gold labels across all 36 cases (`263` gold items). Excluded from `tests/eval/summary.json` `arms[]` and never called Nano.*

- **Oracle model (upper bound) + Envoy Layered:** `0 / 263` outbound leaks (`0.00%`), `minimizationRatio = 42.7%` (`57.3%` character reduction).
