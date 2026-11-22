# Envoy — Empirical Security, Privacy & Utility Evaluation

*Argon Eval Lane (`tests/eval/**`, `packages/cli/**`). Every number below comes from real runs via `scripts/lib/envoy-browser.mjs` (`analyze()` / `answer()` through Firebase AI Logic hybrid inference) or `@envoy/core` deterministic evaluators, stating exact model (`component` + `version`), date, and `n`. Machine-readable contract for the landing page & README: [`tests/eval/summary.json`](../tests/eval/summary.json).*

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
  npm run eval -- --live --arm nano --port 5174 --component <component> --version <version> --label "Gemini Nano (default)"
  ```

---

## 2. Measured Pipeline Arms (`tests/eval/summary.json`)

> **Arm completeness status (`2026-11-22`):**
> - **`gemma4` (`F:\ChromeEnvoy`, `gemma4_component 2026.11.3.1140`, CPU backend):** **FULL `n = 36 / 36`** measured live through `scripts/lib/envoy-browser.mjs` (`runCase`, `36/36` Private, `0` crashes, `0` fallbacks).
> - **`basic` (Rules + Guard + Name Flags, `LanguageModel` unavailable):** **FULL `n = 36 / 36`** measured live through `scripts/lib/envoy-browser.mjs` (`runCase`).
> - **`nano` (`nano_v3_cpu_component 2025.8.21.1028`, default Gemini Nano — already `Ready 100%` on disk):** Queued next for full `36/36` `runCase()` collection (Milestone 2b).

| Arm | Model (`component version`) | Backend | Date | `n / 36` | Mask Recall | False-Mask Rate | Outbound Leaks *(post-guard)* | Clause Acc | Min Ratio *(sent / doc)* | Latency `p50 / p95` |
| --- | --- | --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`gemma4`** | **Gemma 4** (`gemma4_component 2026.11.3.1140`) | CPU (`OnDeviceModelForceCpuBackend`) | `2026-11-22` | **36 / 36** | **100.00%** *(263 / 263)* | 18.1% | **0** | **88.9%** *(32 / 36)* | **21.9%** *(**78.1% reduction**)* | **54,951 ms / 78,361 ms** |
| **`basic`** | *None* (`LanguageModel` unavailable) | rules + guard + name flags | `2026-11-22` | **36 / 36** | **96.96%** *(255 / 263)* | 13.3% | **8** *(7 cases — see below)* | 100.0% *(all clauses)* | 96.0% | **5 ms / 18 ms** |

### Reported Non-Zero Outbound Leaks in `basic` (`n = 36 / 36`, logged in [Issue #7](https://github.com/hesham88/envoy/issues/7))
In Basic protection (no on-device model), `flagNames()` missed **8 unstructured person names across 7 cases**:
- **5 hyphenated Arabic surnames** (`NAME_PATTERNS` only allowed space before `El`/`Al`, not hyphen): `lease-05-sublet-policy` (`Hisham El-Masry`), `med-02-vitamin-d-dosage-local` (`Yasmin El-Banna`), `freelance-04-liability-cap` (`Mostafa El-Gendy`), `noisy-02-eastern-arabic-digits-phone` (`Tariq El-Sawy`), `noisy-08-iso-and-slash-dates-with-card` (`Seif El-Din`).
- **3 stopword-preceded names** (`Landlord`/`Tenant` preceding the name caused `NAME_STOPWORDS` to drop the phrase): `noisy-09-format-variants-same-entity` (`Karim Fathy`, `Mona Adel`), `noisy-10-multi-tenant-joint-liability` (`Karim Fathy`).
- Structured secrets (`NATIONAL_ID`, `IBAN`, `PHONE`, `EMAIL`, `CARD`, `MONEY`, `DATE`, Arabic-Indic digits) had **0 leaks** across all 36 cases, and `checkOutbound()` actively blocked 6 additional cases (`offer-04`, `offer-06`, `med-01`, `freelance-01`, `loan-01`, `noisy-11`) before transmission.

---

## 3. Privacy Attacks — Does Privacy Actually Hold? (Milestone 3)

### 3.1 & 3.2 Re-Identification & Attribute Inference (`tests/eval/run-attacks.mjs`)
- **Attacker model:** Cloud **`gemini-3.5-flash-lite`** via **Firebase AI Logic (`ONLY_IN_CLOUD` + App Check)**, date **`2026-11-22`**, **`n = 12 / 36`** `[PARTIAL n=12/36]` (`118` gold sensitive entities · `31` ground-truth attributes: city, gender, employer/org, salary/amount band).
- The adversary receives **only** the observed outbound text and tries to recover raw names, IDs, IBANs, phones, emails, addresses, amounts, and infer demographic/financial attributes.

| Observed Input Given to Cloud Adversary (`gemini-3.5-flash-lite`, `2026-11-22`, `n = 12`) | Exact Re-ID % | Partial + Exact Re-ID % | Attribute Inference % |
| --- | :---: | :---: | :---: |
| **Envoy (`gemma4` arm: `gemma4_component 2026.11.3.1140` + Rules + Guard)** | **0.0%** *(0 / 118)* | **0.0%** | **0.0%** *(0 / 31)* |
| **Envoy (`basic` arm: Rules + Guard, full doc)** | **0.0%** *(0 / 118)* | **0.0%** | **9.7%** *(3 / 31)* |
| **Baseline: `[REDACTED]` everywhere (full doc)** | 0.0% *(0 / 118)* | 0.0% | 9.7% *(3 / 31)* |
| **Ceiling: Raw Unmasked Document** | **72.0%** *(85 / 118)* | **74.6%** | **64.5%** *(20 / 31)* |

> **Finding:** Naive `[REDACTED]`-everywhere redaction over the full document still leaks **9.7% (`3 / 31`)** of hidden attributes (city, employer, or salary band) from surrounding irrelevant clauses. **Envoy with on-device Gemma 4 (`gemma4_component 2026.11.3.1140`) cuts outbound text by 78.1% and drives BOTH exact re-identification AND attribute inference to `0.0%` (`0 / 118` and `0 / 31`) — strictly beating `[REDACTED]`-everywhere.**

### 3.3 Outbound Guard Red-Team (`tests/eval/redteam.json`, `tests/eval/run-redteam.mjs`)
- **Target:** `@envoy/core` `checkOutbound()` · **Date:** `2026-11-22` · **Cases:** `28` adversarial bypass payloads + `2` clean control cases.
- **Measured result:** **`11 / 28` attacks blocked (`39.3%`)**, **`17` bypasses discovered**, **`2 / 2` clean controls passed (`0` false blocks)**.
- **Blocked today:** Zero-width joiners/BOM inside numeric codes (`rt-02`, `rt-04`), newline splits between name tokens / inside IDs & IBANs (`rt-13`, `rt-15`, `rt-16`), punctuated IBAN/phone/spaced money (`rt-21`, `rt-22`, `rt-24`), Arabic-Indic national IDs (`rt-25`), and fake tag injection `[KARIM_FATHY]` (`rt-26`).
- **17 bypasses reported with minimal repros in [Issue #7](https://github.com/hesham88/envoy/issues/7) for Claude (`packages/core`):**
  - Zero-width space / soft hyphen inside names & emails (`rt-01`, `rt-03`)
  - Cyrillic homoglyphs in names (`rt-05`) & NFD combining accents (`rt-28`)
  - Full-width Unicode digits & Latin (`rt-07`, `rt-08`, `rt-09`)
  - Digits/amounts spelled out in English words (`rt-10`, `rt-11`, `rt-12`)
  - Mid-word line splits (`rt-14`), Base64-encoded values (`rt-17`, `rt-18`), reversed strings (`rt-19`, `rt-20`), defanged `[at]`/`[dot]` emails (`rt-23`), hyphen-spaced secret/org tokens (`rt-27`).

### 3.4 Secrets & CustomRule Evaluation (`tests/eval/run-secrets.mjs`)
- **Target:** `@envoy/core` `scanText()` (`SECRET` + `CustomRule`) · **Date:** `2026-11-22` · **Cases:** `n = 24` (`16` runtime-constructed key-shaped positives — AWS, Google API, GitHub classic/fine PAT, Slack, Stripe live/test, Anthropic, OpenAI, GitLab, PEM private key, JWT, password/api_key/client_secret/auth_token assignments — plus `8` non-secret negative controls; zero secret literals committed).
- **Measured result:** **`100.0%` Recall (`16 / 16`)**, **`94.1%` Precision (`16 / 17`)**, **`6 / 6` CustomRule tests passing** (`terms` case-insensitive whole-word matching, regex patterns, built-in `EMAIL`/`SECRET` overlap priority, invalid-rule safety).
- **1 precision finding logged on [Issue #7](https://github.com/hesham88/envoy/issues/7):** `neg-07-env-template-empty` (`VITE_FIREBASE_API_KEY=\nAUTH_TOKEN=""`) matched across `\n` because `SECRET_DETECTORS[3]` uses `[:=]\s*` instead of `[:=][ \t]*`.

---

## 4. Answer Quality vs. Privacy — PAPILLON-Style Trade-Off (Milestone 4)

- **Runner:** `tests/eval/run-quality.mjs` · **Cloud reasoning & judge model:** **`gemini-3.5-flash-lite`** via Firebase AI Logic (`ONLY_IN_CLOUD` + App Check) · **Date:** `2026-11-22` · **`n = 10 / 20`** `[PARTIAL n=10/20]`.
- Compares **(i) Envoy** (masked approved outbound → cloud Gemini → local `restoreAnswer()` including `{{EXPR}}` local math) against **(ii) Raw Document Ceiling** (cloud Gemini given the full unmasked fictional document), graded on a fixed rubric (`correct` = 1.0, `partially` = 0.5, `wrong` = 0.0, plus `citesRightClause`).

| Arm *(Measured `2026-11-22`, `n = 10`, judge `gemini-3.5-flash-lite`)* | Envoy Score | Raw-Doc Ceiling | **Answer Quality Retained** | Right Clause Cited % | Correct / Partial / Wrong | Exact Re-ID / Attr Inf |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Envoy (`gemma4`: `gemma4_component 2026.11.3.1140`)** | **100.0%** | 100.0% | **100.0%** | **100.0%** | **10 / 0 / 0** | **0.0% / 0.0%** |
| **Envoy (`basic`: Rules + Guard)** | **100.0%** | 100.0% | **100.0%** | **100.0%** | **10 / 0 / 0** | **0.0% / 9.7%** |

> **Privacy–Utility Trade-Off:** Envoy (`gemma4`) retains **100.0% of cloud answer quality (`10/10` correct, `100%` right clause cited)** while cutting cloud re-identification from **72.0% → 0.0%** and attribute inference from **64.5% → 0.0%**.

---

## 5. `envoy-guard` CLI Hook (`packages/cli`, Milestone 6)

- **Package:** `@envoy/cli` (`packages/cli/dist/cli.mjs` → bin `envoy-guard`), rules-only **Basic protection** using `@envoy/core` `scanText()` + `~/.envoy/rules.json` (`CustomRule[]`).
- **Verified agent hook contracts (`2026-11-22`):**
  - **Claude Code:** `UserPromptSubmit` (blocks with finding summary + ready-to-paste masked copy; honestly documents that Claude Code cannot rewrite prompts inline) and `PreToolUse` (`WebFetch|Bash|Write|Edit` → `permissionDecision: "deny"`).
  - **Gemini CLI:** `BeforeAgent` and `BeforeTool` (`web_fetch|run_shell_command|write_file|replace` → strict JSON `{"decision": "deny"|"allow"}`).
- **`envoy-guard init claude|gemini`:** Prints the exact `.claude/settings.json` or `.gemini/settings.json` snippet without editing user settings automatically.
- **Tests:** `packages/cli/src/hook.test.ts` (**9 / 9 passing**).

---

## 6. Limitations & Next Runs

1. **Default Gemini Nano arm (`nano_v3_cpu_component 2025.8.21.1028`, already `Ready 100%` on disk) pending Milestone 2b:** Relaunch Chrome with `gemma4-for-built-in-ai` disabled to collect the full `36/36` default Gemini Nano arm alongside the completed `36/36` `gemma4` and `36/36` `basic` arms.
2. **Guard bypasses (`17/28`) & Basic `flagNames` leaks (`8` across 7 cases):** Reported in [Issue #7](https://github.com/hesham88/envoy/issues/7) for `packages/core` / `packages/ai`; we will re-run `npm run eval` immediately once Claude lands the hardening PR.
3. **Partial cloud attack/quality sample (`n = 12` / `n = 10`):** Paced for Gemini Free Tier RPM; will expand to full `n = 36` / `n = 20` once Milestone 2b (`nano`) completes.

---

## Appendix A — Oracle Model (Upper Bound) *(Synthetic Gold Ceiling — NOT a Real Model)*

*Computed purely in-memory by `tests/eval/run.mjs` from gold labels across all 36 cases (`263` gold items). Excluded from `tests/eval/summary.json` `arms[]` and never called Nano.*

- **Oracle model (upper bound) + Envoy Layered:** `0 / 263` outbound leaks (`0.00%`), `minimizationRatio = 42.7%` (`57.3%` character reduction).
