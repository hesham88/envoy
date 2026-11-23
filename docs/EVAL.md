# Envoy — Empirical Security, Privacy & Utility Evaluation

_Argon Eval Lane (`tests/eval/**`). Every number below comes from real runs via `scripts/lib/envoy-browser.mjs` (`analyze()` / `answer()` through Firebase AI Logic hybrid inference) or `@envoy/core` deterministic evaluators, stating exact model (`component` + `version`), date, and `n`. Machine-readable contract for the landing page & README: [`tests/eval/summary.json`](../tests/eval/summary.json)._

---

## 1. Method & One-Command Reproduction

- **Pipeline execution (`tests/eval/collect-live.mjs`):** Uses the shared product runner `scripts/lib/envoy-browser.mjs` (`connectEnvoyPage`, `runCase`), calling the real `@envoy/ai` `analyze()` (and `answer()` with `--with-answer`) through Firebase AI Logic hybrid inference with the 4-layer device guard and session cleanup built in. Nothing is recomposed outside `analyze()`, and no model output is ever synthesized.
- **Reproduce from a clean checkout (no Chrome needed — uses committed live caches):**
  ```bash
  npm run eval
  ```
- **Re-collect a live arm against Chrome / headless Chromium:**
  ```bash
  npm run eval -- --live --arm basic --port 5174
  npm run eval -- --live --arm gemma4 --port 5174 --component gemma4_component --version 2026.11.3.1140 --label "Gemma 4"
  npm run eval -- --live --arm nano --port 5174 --component nano_v3_cpu_component --version 2025.8.21.1028 --label "Gemini Nano (default)"
  ```

---

## 2. Full Measured Pipeline Matrix — All 3 Arms (`FULL n = 36 / 36`, `2026-11-22`)

All three arms were measured live on **`2026-11-22`** across all **36 benchmark cases (`263` gold sensitive entities)** via `scripts/lib/envoy-browser.mjs`:

- **`nano` (Default Gemini Nano — what ordinary Chrome judges receive):** `nano_v3_cpu_component` `2025.8.21.1028`, CPU backend (`OnDeviceModelForceCpuBackend`), **`36/36` Private, `0` crashes, `0` fallbacks**.
- **`gemma4` (Gemma 4 developer trial):** `gemma4_component` `2026.11.3.1140`, CPU backend (`OnDeviceModelForceCpuBackend` + `gemma4-for-built-in-ai`), **`36/36` Private, `0` crashes, `0` fallbacks**.
- **`basic` (Fallback when on-device model is unavailable):** Rules + Guard + Name Flags in headless Chromium (`LanguageModel` unavailable), **`36/36`**.

| Arm          | Model (`component version`)                                        | Backend                              |                    Date                     |  `n / 36`   |        Mask Recall        | False-Mask Rate | Outbound Leaks _(post-guard)_ |       Clause Acc       |     Min Ratio _(sent / doc)_      |    Latency `p50 / p95`     |
| ------------ | ------------------------------------------------------------------ | ------------------------------------ | :-----------------------------------------: | :---------: | :-----------------------: | :-------------: | :---------------------------: | :--------------------: | :-------------------------------: | :------------------------: |
| **`nano`**   | **Gemini Nano (default)** (`nano_v3_cpu_component 2025.8.21.1028`) | CPU (`OnDeviceModelForceCpuBackend`) |                `2026-11-22`                 | **36 / 36** | **100.00%** _(263 / 263)_ |      22.7%      |             **0**             | **83.3%** _(30 / 36)_  | **10.2%** _(**89.8% reduction**)_ | **67,471 ms / 110,878 ms** |
| **`gemma4`** | **Gemma 4** (`gemma4_component 2026.11.3.1140`)                    | CPU (`OnDeviceModelForceCpuBackend`) |                `2026-11-22`                 | **36 / 36** | **100.00%** _(263 / 263)_ |      18.1%      |             **0**             | **88.9%** _(32 / 36)_  | **21.9%** _(**78.1% reduction**)_ | **54,951 ms / 78,361 ms**  |
| **`basic`**  | _None_ (`LanguageModel` unavailable)                               | rules + guard + name flags           | `2026-11-23` (re-run after the heading fix) | **36 / 36** | **100.00%** _(263 / 263)_ |      7.1%       |  **0** _(was 8, see below)_   | 100.0% _(all clauses)_ |               90.2%               |      **5 ms / 22 ms**      |

### Basic protection leaks: found, fixed, re-measured ([Issue #7](https://github.com/hesham88/envoy/issues/7))

The first Basic run (no on-device model) let **8 person names across 7 cases** reach the outbound text. `flagNames()` missed two shapes of name:

- **5 hyphenated Arabic surnames:** `lease-05-sublet-policy` (`Hisham El-Masry`), `med-02-vitamin-d-dosage-local` (`Yasmin El-Banna`), `freelance-04-liability-cap` (`Mostafa El-Gendy`), `noisy-02-eastern-arabic-digits-phone` (`Tariq El-Sawy`), `noisy-08-iso-and-slash-dates-with-card` (`Seif El-Din`).
- **3 names after a role word:** `noisy-09-format-variants-same-entity` (`Karim Fathy`, `Mona Adel`), `noisy-10-multi-tenant-joint-liability` (`Karim Fathy`). "Landlord Karim Fathy" was discarded whole because "Landlord" is a stopword.

**Fix (PR #17):** the name pattern accepts hyphenated particles, and a match is split at stopwords so the name in "Landlord Karim Fathy" is kept. Each case is a regression test in `packages/core/src/names.test.ts`. **Re-run of all 36 Basic cases through the real pipeline (`collect-live.mjs --arm basic`, `2026-11-22`): 0 leaks, 263 / 263 masked**, and false masks fell from 13.3% to 10.9%. **Re-run on `2026-11-23`** after headings stopped counting as names (a phrase also written in lowercase in the document is not a name): still 0 leaks and 263 / 263 masked, and false masks fell to **7.1%**. Structured details (IDs, IBANs, phones, emails, cards, amounts, dates) never leaked in any arm, and both on-device arms had 0 leaks from the start.

---

## 3. Privacy Attacks — Does Privacy Actually Hold? (Milestone 3)

### 3.1 & 3.2 Re-Identification & Attribute Inference (`tests/eval/run-attacks.mjs`)

- **Attacker model:** Cloud **`gemini-3.5-flash-lite`** via Firebase AI Logic's Gemini endpoint (`firebasevertexai.googleapis.com`), called directly over REST from Node with an App Check token. The SDK only runs in browsers; the model and backend are the same ones the app's cloud step uses, date **`2026-11-22`**, **`n = 12 / 36`** `[PARTIAL n=12/36]` (`118` gold sensitive entities · `31` ground-truth attributes: city, gender, employer/org, salary/amount band).

| Observed Input Given to Cloud Adversary (`gemini-3.5-flash-lite`, `2026-11-22`, `n = 12`) |     Exact Re-ID %      | Partial + Exact Re-ID % | Attribute Inference % |
| ----------------------------------------------------------------------------------------- | :--------------------: | :---------------------: | :-------------------: |
| **Envoy (`nano`: Default Gemini Nano `nano_v3_cpu_component 2025.8.21.1028`)**            |  **0.0%** _(0 / 118)_  |        **0.9%**         |  **0.0%** _(0 / 31)_  |
| **Envoy (`gemma4`: Gemma 4 `gemma4_component 2026.11.3.1140`)**                           |  **0.0%** _(0 / 118)_  |        **0.0%**         |  **0.0%** _(0 / 31)_  |
| **Envoy (`basic`: Rules + Guard, full doc)**                                              |  **0.0%** _(0 / 118)_  |        **0.0%**         |  **9.7%** _(3 / 31)_  |
| **Baseline: `[REDACTED]` everywhere (full doc)**                                          |    0.0% _(0 / 118)_    |          0.0%           |    9.7% _(3 / 31)_    |
| **Ceiling: Raw Unmasked Document**                                                        | **72.0%** _(85 / 118)_ |        **74.6%**        | **64.5%** _(20 / 31)_ |

> **Finding:** Naive `[REDACTED]`-everywhere redaction over the full document still leaks **9.7% (`3 / 31`)** of hidden attributes from surrounding irrelevant clauses. **Both on-device Envoy arms (`nano` and `gemma4`) drive BOTH exact re-identification AND attribute inference to `0.0%` (`0 / 118` and `0 / 31`) — strictly beating `[REDACTED]`-everywhere.**

### 3.3 Outbound Guard Red-Team (`tests/eval/redteam.json`, `tests/eval/run-redteam.mjs`)

- **Target:** `@envoy/core` `checkOutbound()` · **Date:** `2026-11-22` · **Cases:** `28` adversarial bypass payloads + `2` clean controls.
- **Before PR #11 hardening:** `11 / 28` blocked (`39.3%`), `17` bypasses reported in [Issue #7](https://github.com/hesham88/envoy/issues/7).
- **After PR #11 hardening:** `17 / 28` attacks blocked (`60.7%`), `11` remaining bypasses, `2 / 2` clean controls passed.
- **After PR #14:** **`20 / 28` attacks blocked**, **`8` remaining bypasses**. PR #14 closed combining accents (`rt-28`), defanged emails (`rt-23`) and spaced-out values containing digits (`rt-27`).
- **After PR #22 (current `main`, rerun by `npm run eval`): `28 / 28` attacks blocked, `0` bypasses, `2 / 2` clean controls passed.** The guard now also reads the text with number words folded into digits (`rt-10`–`rt-12`), with a word split across lines joined (`rt-14`), reversed (`rt-19`, `rt-20`), and with base64 blobs decoded (`rt-17`, `rt-18`). It **fails closed** on encoded text: a base64 blob that decodes to readable text is blocked even when nothing protected is found in it, because the person approving can't read it either. Every red-team case is also a unit test (`packages/core/src/guard-redteam.test.ts`), with false-positive checks on ordinary prose and the masked sample lease.
  - **Newly blocked by PR #11 (6 bypasses closed):** zero-width space in names (`rt-01`), soft hyphen in emails (`rt-03`), Cyrillic homoglyphs in names (`rt-05`), full-width digits & Latin (`rt-07`, `rt-08`, `rt-09`).
  - **Remaining 11 bypasses (tracked in [Issue #7](https://github.com/hesham88/envoy/issues/7)):** digits/amounts spelled in words (`rt-10`, `rt-11`, `rt-12`), mid-word line split (`rt-14`), Base64 (`rt-17`, `rt-18`), reversed strings (`rt-19`, `rt-20`), defanged email (`rt-23`), hyphen-spaced key token (`rt-27`), NFD combining accents (`rt-28`).

### 3.4 Secrets & CustomRule Evaluation (`tests/eval/run-secrets.mjs`)

- **Target:** `@envoy/core` `scanText()` (`SECRET` + `CustomRule`) · **Date:** `2026-11-22` · **Cases:** `n = 24` (`16` runtime-constructed key-shaped positives + `8` negative controls; zero secret literals committed).
- **Measured result:** **`100.0%` Recall (`16 / 16`)**, **`94.1%` Precision (`16 / 17`)**, **`6 / 6` CustomRule tests passing**.
- **1 precision finding tracked in [Issue #7](https://github.com/hesham88/envoy/issues/7):** `neg-07-env-template-empty` (`VITE_FIREBASE_API_KEY=\nAUTH_TOKEN=""`) matches across `\n`.

---

## 4. Answer Quality vs. Privacy — PAPILLON-Style Trade-Off (Milestone 4)

- **Runner:** `tests/eval/run-quality.mjs` · **Cloud reasoning & judge model:** **`gemini-3.5-flash-lite`** via Firebase AI Logic's Gemini endpoint (`firebasevertexai.googleapis.com`), called directly over REST from Node with an App Check token. The SDK only runs in browsers; the model and backend are the same ones the app's cloud step uses. **How Envoy's answers were produced here:** the recorded runs didn't include `answer()`, so each Envoy answer was regenerated from the run's real approved outbound with the product's `buildReasonPrompt` plus one extra line about tag syntax, then restored with `restoreAnswer`. Treat this as an estimate of the product's answer quality on a 10-question sample, not a measurement of `answer()` itself · **Date:** `2026-11-22` · **`n = 10 / 20`** `[PARTIAL n=10/20]`.

| Arm _(Measured `2026-11-22`, `n = 10`, judge `gemini-3.5-flash-lite`)_ | Envoy Score | Raw-Doc Ceiling | **Answer Quality Retained** | Right Clause Cited % | Correct / Partial / Wrong | Exact Re-ID / Attr Inf |
| ---------------------------------------------------------------------- | :---------: | :-------------: | :-------------------------: | :------------------: | :-----------------------: | :--------------------: |
| **Envoy (`nano`: Default Gemini Nano `2025.8.21.1028`)**               | **100.0%**  |     100.0%      |         **100.0%**          |      **100.0%**      |      **10 / 0 / 0**       |    **0.0% / 0.0%**     |
| **Envoy (`gemma4`: Gemma 4 `2026.11.3.1140`)**                         | **100.0%**  |     100.0%      |         **100.0%**          |      **100.0%**      |      **10 / 0 / 0**       |    **0.0% / 0.0%**     |
| **Envoy (`basic`: Rules + Guard)**                                     | **100.0%**  |     100.0%      |         **100.0%**          |      **100.0%**      |      **10 / 0 / 0**       |    **0.0% / 9.7%**     |

---

## 5. Limitations

1. **CPU latency on 2018 laptop hardware (`i7-8750H`, CPU-only backend because 2016 Pascal GTX 1050 Ti crashes Dawn):** `p50` is `54.9s` (`gemma4`) / `67.5s` (`nano`); GPU-backed systems should be much faster, but we have not measured one, so no GPU figure is claimed.
2. **The red team is 28 cases.** All are blocked today, but 28 cases are not proof against every encoding or paraphrase. Envoy's claim is the measured one: it minimizes what leaves, masks what it detects, and blocks detected leaks, including disguised ones. Indirect identification (a combination of non-identifying details) is measured separately by the attribute-inference attack (section 3).
3. **Cloud attack & quality sample size (`n = 12` / `n = 10`):** Paced for Gemini Developer API Free Tier RPM limits; clearly labeled partial alongside the full `36/36` pipeline matrix.

---

## Appendix A — Oracle Model (Upper Bound) _(Synthetic Gold Ceiling — NOT a Real Model)_

_Computed purely in-memory by `tests/eval/run.mjs` from gold labels across all 36 cases (`263` gold items). Excluded from `tests/eval/summary.json` `arms[]` and never called Nano._

- **Oracle model (upper bound) + Envoy Layered:** `0 / 263` outbound leaks (`0.00%`), `minimizationRatio = 42.7%` (`57.3%` character reduction).
