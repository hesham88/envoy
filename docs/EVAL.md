# Envoy — Empirical Security, Privacy & Utility Evaluation

_Argon Eval Lane (`tests/eval/**`, `docs/EVAL.md`). Every number below comes from real runs via `scripts/lib/envoy-browser.mjs` (`analyze()` / `answer()` through Firebase AI Logic hybrid inference in Chrome), real in-browser Firebase AI Logic SDK `ONLY_IN_CLOUD` calls (`tests/eval/lib/browser-sdk.mjs`), or `@envoy/core` deterministic evaluators, stating exact model (`component` + `version`), date, and `n`. Machine-readable contract for the landing page & README: [`tests/eval/summary.json`](../tests/eval/summary.json) (now with per-metric `metricsN`)._

---

> **Measured setups: Gemma 4 and Basic protection.** Chrome's earlier default model (Gemini Nano 3, `nano_v3_cpu_component`) ran all 36 cases cleanly on 22 November 2026, but a re-measure on the current pipeline crashed after 12 cases on the 16 GB measurement laptop on 23 November, so its numbers were removed rather than published stale (they stay in the git history). The contest model is Gemini Nano 4, built on Gemma 4; Envoy is measured and demonstrated on Gemma 4 (`gemma4_component`, re-measured 24 November) and on Basic protection (23 November).

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

## 2. Full Measured Pipeline Matrix: Gemma 4 and Basic protection (`n = 36 / 36`)

Both setups were measured live across all **36 benchmark cases (`263` gold sensitive entities)** via `scripts/lib/envoy-browser.mjs`: Gemma 4 on **`2026-11-24`**, on the current pipeline (after the 23 November fixes to how the model's findings are read and the `ACCOUNT` rule), and Basic protection on `2026-11-23`. The Gemma 4 run from 22 November is replaced; it stays in the git history.

- **`gemma4` (Gemma 4 developer trial):** `gemma4_component` `2026.11.3.1140`, CPU backend (`OnDeviceModelForceCpuBackend` + `gemma4-for-built-in-ai`), **`36/36` Private, `0` fallbacks**.
- **`basic` (Fallback when on-device model is unavailable):** Rules + Guard + Name Flags in headless Chromium (`LanguageModel` unavailable), **`36/36`**.

> **Min Ratio** is the document's own text sent (without the question and the clause labels) over the whole document. Basic protection sends every clause, masked, so it reads about 90%: tags are shorter than the values they replace.

| Arm          | Model (`component version`)                     | Backend                              |                    Date                     |  `n / 36`   |        Mask Recall        | False-Mask Rate | Outbound Leaks _(post-guard)_ |       Clause Acc       |     Min Ratio _(sent / doc)_      |    Latency `p50 / p95`     |
| ------------ | ----------------------------------------------- | ------------------------------------ | :-----------------------------------------: | :---------: | :-----------------------: | :-------------: | :---------------------------: | :--------------------: | :-------------------------------: | :------------------------: |
| **`gemma4`** | **Gemma 4** (`gemma4_component 2026.11.3.1140`) | CPU (`OnDeviceModelForceCpuBackend`) |                `2026-11-24`                 | **36 / 36** | **100.00%** _(263 / 263)_ |      6.1%       |             **0**             | **86.1%** _(31 / 36)_  | **23.2%** _(**76.8% reduction**)_ | **73,491 ms / 118,564 ms** |
| **`basic`**  | _None_ (`LanguageModel` unavailable)            | rules + guard + name flags           | `2026-11-23` (re-run after the heading fix) | **36 / 36** | **100.00%** _(263 / 263)_ |      6.4%       |  **0** _(was 8, see below)_   | 100.0% _(all clauses)_ |               90.6%               |      **6 ms / 21 ms**      |

### Basic protection leaks: found, fixed, re-measured ([Issue #7](https://github.com/hesham88/envoy/issues/7))

The first Basic run (no on-device model) let **8 person names across 7 cases** reach the outbound text. `flagNames()` missed two shapes of name:

- **5 hyphenated Arabic surnames:** `lease-05-sublet-policy` (`Hisham El-Masry`), `med-02-vitamin-d-dosage-local` (`Yasmin El-Banna`), `freelance-04-liability-cap` (`Mostafa El-Gendy`), `noisy-02-eastern-arabic-digits-phone` (`Tariq El-Sawy`), `noisy-08-iso-and-slash-dates-with-card` (`Seif El-Din`).
- **3 names after a role word:** `noisy-09-format-variants-same-entity` (`Karim Fathy`, `Mona Adel`), `noisy-10-multi-tenant-joint-liability` (`Karim Fathy`). "Landlord Karim Fathy" was discarded whole because "Landlord" is a stopword.

**Fix (PR #17):** the name pattern accepts hyphenated particles, and a match is split at stopwords so the name in "Landlord Karim Fathy" is kept. Each case is a regression test in `packages/core/src/names.test.ts`. **Re-run of all 36 Basic cases through the real pipeline (`collect-live.mjs --arm basic`, `2026-11-22`): 0 leaks, 263 / 263 masked**, and false masks fell from 13.3% to 10.9%. **Re-run on `2026-11-23`** after headings stopped counting as names (a phrase also written in lowercase in the document is not a name): still 0 leaks and 263 / 263 masked, and false masks fell to **6.4%**. Structured details (IDs, IBANs, phones, emails, cards, amounts, dates) never leaked in any arm, and both on-device arms had 0 leaks from the start.

---

## 3. Privacy Attacks & Guard Hardening

### 3.1 & 3.2 Re-Identification & Attribute Inference (`FULL n = 36 / 36`, In-Browser Firebase AI Logic SDK)

- **Runner:** `tests/eval/run-attacks.mjs` (`tests/eval/lib/browser-sdk.mjs` + `sdk-bridge.mjs`).
- **Attacker model & transport:** Cloud **`gemini-3.5-flash-lite`** called **inside Chromium via the Firebase AI Logic SDK** (`getGenerativeModel` with `InferenceMode.ONLY_IN_CLOUD`, Remote Config `cloud_model` / `VITE_CLOUD_MODEL`, and App Check; `inferenceSource === 'in_cloud'` asserted on every call), date **`2026-11-22`**, **`n = 36 / 36`** (`263` gold sensitive entities · `77` ground-truth attributes: city, gender, employer/org, salary/amount band · `114` live SDK calls cached with `source: 'live'`).

| Observed Input Given to Cloud Adversary (`gemini-3.5-flash-lite` via Firebase AI Logic SDK `ONLY_IN_CLOUD`, `2026-11-22`, `n = 36 / 36`) |      Exact Re-ID %      | Partial + Exact Re-ID % | Attribute Inference % |
| ---------------------------------------------------------------------------------------------------------------------------------------- | :---------------------: | :---------------------: | :-------------------: |
| **Envoy (`gemma4`: Gemma 4 `gemma4_component 2026.11.3.1140`)**                                                                          |  **0.0%** _(0 / 263)_   |        **0.0%**         |  **0.0%** _(0 / 77)_  |
| **Envoy (`basic`: Rules + Guard + Name Flags, full doc)**                                                                                |  **0.0%** _(0 / 263)_   |        **0.0%**         |  **3.9%** _(3 / 77)_  |
| **Baseline: `[REDACTED]` everywhere (full doc)**                                                                                         |    1.5% _(4 / 263)_     |          1.5%           |    6.5% _(5 / 77)_    |
| **Ceiling: Raw Unmasked Document**                                                                                                       | **85.5%** _(225 / 263)_ |        **87.5%**        | **67.5%** _(52 / 77)_ |

> **Finding:** Across all **36 / 36** cases (`263` gold entities, `77` attributes), naive `[REDACTED]`-everywhere over the full document still leaks **1.5% (`4 / 263`)** exact values and **6.5% (`5 / 77`)** hidden attributes from surrounding context. **The on-device Envoy arm (`gemma4`) drives exact re-identification, partial re-identification, AND attribute inference to `0.0%` (`0 / 263` and `0 / 77`) — strictly beating `[REDACTED]`-everywhere.**

### 3.3 Outbound Guard Red-Team (`tests/eval/redteam.json`, `tests/eval/run-redteam.mjs`)

- **Target:** `@envoy/core` `checkOutbound()` (`packages/core/src/guard.ts` + `guard-variants.ts`) · **Date:** `2026-11-22` · **Cases:** `28` adversarial bypass payloads + `10` false-positive controls (ordinary lease prose with number words, non-protected spelled-out numbers, binary SHA-256 Base64 digest, reversible English words, multi-line substring overlap `"Simona\nAdelaide"` vs `"Mona Adel"`, real multi-line masked lease clauses, short digit-word runs, hyphenated line-wrapped prose).

| Stage                                                     |    Attacks Blocked     | Bypasses | Controls Clean | False Blocks |
| --------------------------------------------------------- | :--------------------: | :------: | :------------: | :----------: |
| Initial baseline (Issue #7)                               |   `11 / 28` (39.3%)    |   `17`   |    `2 / 2`     |     `0`      |
| After PR #11 (ZWSP, homoglyphs, full-width)               |   `17 / 28` (60.7%)    |   `11`   |    `2 / 2`     |     `0`      |
| After PR #14 (NFD accents, defanged email, spaced tokens) |   `20 / 28` (71.4%)    |   `8`    |    `2 / 2`     |     `0`      |
| **After PR #22 + Milestone 3 controls (current `main`)**  | **`28 / 28` (100.0%)** | **`0`**  | **`10 / 10`**  |   **`0`**    |

- **PR #22 closed all 8 remaining bypasses (`packages/core/src/guard-variants.ts`, `packages/core/src/guard-redteam.test.ts`):** the guard now also reads the text with number words folded into digits (`rt-10`–`rt-12`), with a word split across lines joined (`rt-14`), reversed (`rt-19`, `rt-20`), and with Base64 blobs decoded (`rt-17`, `rt-18`). It **fails closed** on encoded text: a Base64 blob that decodes to readable ASCII text is blocked even when nothing protected is found inside it (because the reviewer cannot read it either), while non-readable binary digests (e.g., SHA-256 in `rt-ctrl-05`) and all 10 false-positive controls pass with `0` false blocks.

### 3.4 Secrets & CustomRule Evaluation (`tests/eval/run-secrets.mjs`)

- **Target:** `@envoy/core` `scanText()` (`SECRET` + `CustomRule`) · **Date:** `2026-11-22` · **Cases:** `n = 24` (`16` runtime-constructed key-shaped positives + `8` negative controls; zero secret literals committed).
- **Measured result:** **`100.0%` Recall (`16 / 16`)**, **`100.0%` Precision (`16 / 16`, 0 false positives)**, **`6 / 6` CustomRule tests passing**.
- **Fixed on `2026-11-23` ([Issue #7](https://github.com/hesham88/envoy/issues/7)), the rule now allows only spaces or tabs after `=` or `:`; it used to match across a line break:** `neg-07-env-template-empty` (`VITE_FIREBASE_API_KEY=\nAUTH_TOKEN=""`) matches across `\n`.

---

## 4. Answer Quality vs. Privacy — Real `runCase({ withAnswer: true })` (Milestone 1)

- **Method:** Every Envoy answer graded here is the **verbatim `result.answer.text`** returned by `@envoy/ai` `answer()` during a live browser `runCase({ withAnswer: true })` run — **no regenerated answers and no extra prompt lines**. If the real product's `checkOutbound()` blocked sending (`OutboundBlockedError`), that question is scored honestly as `0.0` (`guard_blocked`, unattended) because the user receives no automatic answer until they manually uncheck the false-flagged heading in the Review screen.
- **Judge & raw-document ceiling:** Separate cloud judge **`gemini-3.5-flash-lite`** running inside Chromium via the **Firebase AI Logic SDK (`InferenceMode.ONLY_IN_CLOUD` + App Check)**. Gemma 4 answers collected and judged on `2026-11-24`; Basic on `2026-11-23`. The judge also wrote the cloud answers (7 of Gemma 4's 20 and all of Basic's), so every answer was also checked by the team (below).

| Arm _(Judge `gemini-3.5-flash-lite` via Firebase AI Logic SDK `ONLY_IN_CLOUD`)_              |  `n`   | Sources _(device / cloud / guard-blocked)_ |     Unblocked Score     | **Overall Envoy Score (unattended)** | Raw-Doc Ceiling | **Answer Quality Retained** | Right Clause Cited % | Correct / Partial / Wrong |
| -------------------------------------------------------------------------------------------- | :----: | :----------------------------------------: | :---------------------: | :----------------------------------: | :-------------: | :-------------------------: | :------------------: | :-----------------------: |
| **`basic`** (Rules + Guard + Name Flags) _(re-measured `2026-11-23`, after the heading fix)_ | **20** |                `0 / 20 / 0`                | **97.5%** _(19.5 / 20)_ |       **97.5%** _(19.5 / 20)_        |     100.0%      |          **97.5%**          |        100.0%        |       `19 / 1 / 0`        |
| **`gemma4`** (`gemma4_component 2026.11.3.1140`) _(`2026-11-24`, current pipeline)_          | **20** |                `8 / 12 / 0`                | **97.5%** _(19.5 / 20)_ |       **97.5%** _(19.5 / 20)_        |     100.0%      |          **97.5%**          |        100.0%        |       `19 / 1 / 0`        |

**Checked by the team: our AI coding assistants and human reviewers.** Every verbatim answer was read against its document with the same rubric (correct 1.0, partly right 0.5, wrong 0.0). The raters didn't write the answers, so the answerer doesn't grade itself, but they are not independent of the team. Every verdict, its reason and the SHA-256 of the exact answer it rates: [`quality-ratings-team.json`](../tests/eval/probes/quality-ratings-team.json). `npm run eval:check` recomputes these scores and checks each rating still matches its answer.

| Arm      | `n` |   Score   | Correct / Partial / Wrong |
| -------- | :-: | :-------: | :-----------------------: |
| `basic`  | 20  | **97.5%** |       `19 / 1 / 0`        |
| `gemma4` | 20  | **95.0%** |       `18 / 2 / 0`        |

#### Where each number comes from

| Number                                           | File                                                                          | Field                                                                          | Run ID / Date                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Gemma 4 answers (36 cases, 20 answered)          | [`probes/arms/gemma4.json`](../tests/eval/probes/arms/gemma4.json)            | `updatedAt`, `entries[id].result.answer.text`                                  | `2026-11-24T20:18:59.751Z` (product commit `584cc81`)                 |
| Basic answers (36 cases, 20 answered)            | [`probes/arms/basic.json`](../tests/eval/probes/arms/basic.json)              | `updatedAt`, `entries[id].result.answer.text`                                  | `2026-11-23T10:34:55.104Z`                                            |
| Flash-Lite judge (Gemma 4 & Basic)               | [`quality-results.json`](../tests/eval/quality-results.json)                  | `byArm.gemma4`, `byArm.basic`                                                  | `generatedAt` `2026-11-24T20:31:49.750Z` (`2026-11-24`, `2026-11-23`) |
| Checked by the team (Gemma 4 95.0%, Basic 97.5%) | [`quality-ratings-team.json`](../tests/eval/probes/quality-ratings-team.json) | `arms[].score`, `answersFrom.runId`, `rows[].answerSha256`                     | `2026-11-24`                                                          |
| Published contract                               | [`summary.json`](../tests/eval/summary.json)                                  | `arms[].runId`, `arms[].metrics.answerQualityRetained`, `arms[].answerQuality` | Recomputed by `npm run eval`, checked by `npm run eval:check`         |

> **Where Private mode lost quality, and the fix:** on the first 24 November run, all four weak Gemma 4 answers came from the on-device answer path on questions that need a calculation (the bonus, the co-pay, the contract end, the cancellation tier); the router had sent them to the device (route accuracy 55.6%). Envoy now sends any question that needs a figure worked out (a percentage, an amount, a cap, a what-if) to the reasoning step, whatever the router says (`guardRoute`, `packages/core/src/prompts.ts`); the cloud writes `{{EXPR}}` and the numbers are still computed on the device. Re-measured the same evening: route accuracy 80.6%, team check 87.5% → 95.0%, judge 95.0% → 97.5%. The cost: 23.2% of the text is sent instead of 14.5% (those questions now send a masked excerpt), and re-identification and attribute inference, re-run on the new outbounds, stay at 0.0%. Two answers are still partly right: the contract end date isn't given, and the cloud wrote the bonus as `{{MONTHLY_BASE_SALARY * 1.8}}` with a tag name Envoy didn't have, so it couldn't be computed. In one case (`freelance-03`) the cloud call failed and the SDK answered on the device (`PREFER_IN_CLOUD`); the answer was right and the receipt says where it came from.

> **History (22–23 November), kept for the record. Honest drop from the prior `n = 10` regenerated estimate (`100%` → `66.7%` Nano / `75.0%` Basic) — two real product causes uncovered:**
>
> 1. **5 / 20 unattended `OutboundBlockedError` blocks on both arms** (`offer-04`, `offer-05`/`offer-01`, `med-01`, `freelance-01`, `loan-01`): `flagNames()` flagged Title-Case headings (`"Base Salary"`, `"Referring Physician"`, `"Milestone Fee"`, `"Principal Balance"`, `"Without Cause"`) as `PERSON` entities, and `checkOutbound()` then blocked lowercase mentions of those exact phrases in the body text until the user clears them in the Review screen.
>    **Fixed on `2026-11-23`** (`packages/core/src/names.ts`): a capitalised phrase also written in lowercase in the document or the question, across spaces or hyphens, is not a name. Basic re-measured with answers: **0 blocks**, quality retained **75.0% → 97.5%**; a unit test now runs all 36 cases in Basic protection and fails on any block. The Gemini Nano 3 row was removed with that arm (see the note at the top).

> **About `tests/eval/answer-quality.json`.** This is an earlier harness (`run-answers.mjs`, 22 November, 10 questions, before the heading fix), kept for the record and replaced by the measurement above. Its one `zeroCloudLeak: false` row (`med-01`) means the guard **refused** to send: `flagNames()` had flagged the heading "Referring Physician" as a name, and the guard blocked the masked text. Nothing was sent. That false block is cause 1 in the history above, and it was fixed on 23 November.

---

## 5. Recorded On-Device Demo Traces for Judges (Milestone 4)

For judges without an on-device model, a verbatim `analyze()` + `answer()` recording of the official Cairo sample lease (the film's question: `"Can my landlord raise my rent 20% this year? What's the most it can go up to?"`) is committed under `tests/eval/probes/` (never edited or synthesized; marked `"recording": true`). The app replays it at `/app?recorded=1`; a test keeps the app's copy identical.

| File                                                                    | On-Device Model (`component version`)           | Cloud Model             |      Recorded At       |          Mode / Selected / Route          | Guard / Outbound Chars |                               Answer Source & Latency                                |
| ----------------------------------------------------------------------- | ----------------------------------------------- | ----------------------- | :--------------------: | :---------------------------------------: | :--------------------: | :----------------------------------------------------------------------------------: |
| [`demo-trace-gemma4.json`](../tests/eval/probes/demo-trace-gemma4.json) | **Gemma 4** (`gemma4_component 2026.11.3.1140`) | `gemini-3.5-flash-lite` | `2026-11-24T12:55:42Z` | `private` · Clause `[7]` · `local: false` |  clean · `267` chars   | `in_cloud` (`1,933 ms`), `EGP 9,350` worked out on the device from `{{RENT * 1.10}}` |

The trace includes `steps` (`step`, `source`, `ms`), `selectedIds`, `selectionReason`, `route` (`local`, `reason`), `outbound`, `receipt`, `answer` (`text`, `spans`, `source`, `lighter`, `ms`, `receipt`), `model` (`component`, `version`, `label`), `network`, and `recordedAt`.

---

## 6. `summary.json` `metricsN` & Traceability Contract, and Known Limitations

Every arm in [`tests/eval/summary.json`](../tests/eval/summary.json) publishes its source `runId`, per-metric sample sizes (`metricsN`) and both `judge` and `team` answer-quality breakdowns so the landing page never hides or conflates `n`:

```json
"runId": "2026-11-24T20:18:59.751Z",
"metricsN": {
  "maskRecall": 36,
  "falseMaskRate": 36,
  "outboundLeaks": 36,
  "clauseAccuracy": 36,
  "latencyMs": 36,
  "minimizationRatio": 36,
  "reid": 36,
  "attribute": 36,
  "answerQuality": 20
},
"answerQuality": {
  "judge": { "score": 0.975, "n": 20, "model": "gemini-3.5-flash-lite", "dates": ["2026-11-24"] },
  "team": { "score": 0.95, "n": 20, "correct": 18, "partially": 2, "wrong": 0, "ratedOn": "2026-11-24", "source": "tests/eval/probes/quality-ratings-team.json" }
}
```

### Limitations

1. **CPU latency on 2018 laptop hardware (`i7-8750H`, CPU-only backend because 2016 Pascal GTX 1050 Ti crashes Dawn):** `p50` is `73.5s` (`gemma4`, 24 Nov; `54.9s` on 22 Nov); GPU-backed systems should be much faster, but we have not measured one, so no GPU figure is claimed.
2. **The red team is 28 cases + 10 false-positive controls.** All 28 are blocked today with 0 false blocks, but 28 cases are not proof against every encoding or paraphrase. Envoy's claim is the measured one: it minimizes what leaves, masks what it detects, and blocks detected leaks, including disguised ones. Indirect identification is measured separately by the 36-case attribute-inference attack (section 3).
3. **Title-Case heading false flags in `flagNames()`:** fixed on `2026-11-23` (see §4). Basic now has 0 unattended blocks on the 36 cases. On the private path, the same day's live runs found two more false blocks (the model calling "the Company" an organisation and "90" in "ninety (90) days" money); model findings that are generic role words or bare numbers as money are now dropped.
4. **Answer quality is measured on 20 of the 36 cases** (the cases with a single clear answer). Gemma 4's run on 24 November also re-measured its privacy numbers on the current pipeline; on-device timing that day was slower than on 22 November (p50 73 s against 55 s on the same laptop, which was also running other work).
5. **The 36 cases didn't contain every ordinary shape.** On 23 November real use found that a plain bank account number written as "my bank account number 1010192316" went out unmasked: the rules knew IBANs but not plain account numbers, and the eval had no such case. Fixed the same day with an `ACCOUNT` rule (a 6+ digit number the text calls an account, card, policy, passport, ID or routing number), now unit-tested. "Every private detail masked" means every detail in these 36 cases; Envoy masks what it detects.
6. **Benchmark scope:** 36 English test documents, 263 planted details and 28 red-team attacks are a finite benchmark, not a universal privacy guarantee. Next we'll expand the suite with multilingual documents, unusual account-number formats and ambiguous references to people.

---

## Appendix A — Oracle Model (Upper Bound) _(Synthetic Gold Ceiling — NOT a Real Model)_

_Computed purely in-memory by `tests/eval/run.mjs` from gold labels across all 36 cases (`263` gold items). Excluded from `tests/eval/summary.json` `arms[]` and never called Nano._

- **Oracle model (upper bound) + Envoy Layered:** `0 / 263` outbound leaks (`0.00%`), `minimizationRatio = 42.7%` (`57.3%` character reduction).
