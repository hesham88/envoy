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
  npm run eval -- --live --arm nano --port 5174 --component nano_v3_cpu_component --version 2025.8.21.1028 --label "Gemini Nano (default)"
  ```

---

## 2. Full Measured Pipeline Matrix — All 3 Arms (`FULL n = 36 / 36`, `2026-11-22`)

All three arms were measured live on **`2026-11-22`** across all **36 benchmark cases (`263` gold sensitive entities)** via `scripts/lib/envoy-browser.mjs`:
- **`nano` (Default Gemini Nano — what ordinary Chrome judges receive):** `nano_v3_cpu_component` `2025.8.21.1028`, CPU backend (`OnDeviceModelForceCpuBackend`), **`36/36` Private, `0` crashes, `0` fallbacks**.
- **`gemma4` (Gemma 4 developer trial):** `gemma4_component` `2026.11.3.1140`, CPU backend (`OnDeviceModelForceCpuBackend` + `gemma4-for-built-in-ai`), **`36/36` Private, `0` crashes, `0` fallbacks**.
- **`basic` (Fallback when on-device model is unavailable):** Rules + Guard + Name Flags in headless Chromium (`LanguageModel` unavailable), **`36/36`**.

| Arm | Model (`component version`) | Backend | Date | `n / 36` | Mask Recall | False-Mask Rate | Outbound Leaks *(post-guard)* | Clause Acc | Min Ratio *(sent / doc)* | Latency `p50 / p95` |
| --- | --- | --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`nano`** | **Gemini Nano (default)** (`nano_v3_cpu_component 2025.8.21.1028`) | CPU (`OnDeviceModelForceCpuBackend`) | `2026-11-22` | **36 / 36** | **100.00%** *(263 / 263)* | 22.7% | **0** | **83.3%** *(30 / 36)* | **10.2%** *(**89.8% reduction**)* | **67,471 ms / 110,878 ms** |
| **`gemma4`** | **Gemma 4** (`gemma4_component 2026.11.3.1140`) | CPU (`OnDeviceModelForceCpuBackend`) | `2026-11-22` | **36 / 36** | **100.00%** *(263 / 263)* | 18.1% | **0** | **88.9%** *(32 / 36)* | **21.9%** *(**78.1% reduction**)* | **54,951 ms / 78,361 ms** |
| **`basic`** | *None* (`LanguageModel` unavailable) | rules + guard + name flags | `2026-11-22` | **36 / 36** | **96.96%** *(255 / 263)* | 13.3% | **8** *(7 cases — see below)* | 100.0% *(all clauses)* | 96.0% | **6 ms / 28 ms** |

### Reported Non-Zero Outbound Leaks in `basic` (`n = 36 / 36`, tracked in [Issue #7](https://github.com/hesham88/envoy/issues/7))
In Basic protection (no on-device model), `flagNames()` missed **8 unstructured person names across 7 cases**:
- **5 hyphenated Arabic surnames:** `lease-05-sublet-policy` (`Hisham El-Masry`), `med-02-vitamin-d-dosage-local` (`Yasmin El-Banna`), `freelance-04-liability-cap` (`Mostafa El-Gendy`), `noisy-02-eastern-arabic-digits-phone` (`Tariq El-Sawy`), `noisy-08-iso-and-slash-dates-with-card` (`Seif El-Din`).
- **3 stopword-preceded names:** `noisy-09-format-variants-same-entity` (`Karim Fathy`, `Mona Adel`), `noisy-10-multi-tenant-joint-liability` (`Karim Fathy`).
- Structured secrets (`NATIONAL_ID`, `IBAN`, `PHONE`, `EMAIL`, `CARD`, `MONEY`, `DATE`, Arabic-Indic digits) had **0 leaks** across all 36 cases, and both on-device arms (**`nano`** and **`gemma4`**) eliminated all 8 leaks (**`0 / 263` outbound leaks**).

---

## 3. Privacy Attacks — Does Privacy Actually Hold? (Milestone 3)

### 3.1 & 3.2 Re-Identification & Attribute Inference (`tests/eval/run-attacks.mjs`)
- **Attacker model:** Cloud **`gemini-3.5-flash-lite`** via **Firebase AI Logic (`ONLY_IN_CLOUD` + App Check)**, date **`2026-11-22`**, **`n = 12 / 36`** `[PARTIAL n=12/36]` (`118` gold sensitive entities · `31` ground-truth attributes: city, gender, employer/org, salary/amount band).

| Observed Input Given to Cloud Adversary (`gemini-3.5-flash-lite`, `2026-11-22`, `n = 12`) | Exact Re-ID % | Partial + Exact Re-ID % | Attribute Inference % |
| --- | :---: | :---: | :---: |
| **Envoy (`nano`: Default Gemini Nano `nano_v3_cpu_component 2025.8.21.1028`)** | **0.0%** *(0 / 118)* | **0.9%** | **0.0%** *(0 / 31)* |
| **Envoy (`gemma4`: Gemma 4 `gemma4_component 2026.11.3.1140`)** | **0.0%** *(0 / 118)* | **0.0%** | **0.0%** *(0 / 31)* |
| **Envoy (`basic`: Rules + Guard, full doc)** | **0.0%** *(0 / 118)* | **0.0%** | **9.7%** *(3 / 31)* |
| **Baseline: `[REDACTED]` everywhere (full doc)** | 0.0% *(0 / 118)* | 0.0% | 9.7% *(3 / 31)* |
| **Ceiling: Raw Unmasked Document** | **72.0%** *(85 / 118)* | **74.6%** | **64.5%** *(20 / 31)* |

> **Finding:** Naive `[REDACTED]`-everywhere redaction over the full document still leaks **9.7% (`3 / 31`)** of hidden attributes from surrounding irrelevant clauses. **Both on-device Envoy arms (`nano` and `gemma4`) drive BOTH exact re-identification AND attribute inference to `0.0%` (`0 / 118` and `0 / 31`) — strictly beating `[REDACTED]`-everywhere.**

### 3.3 Outbound Guard Red-Team (`tests/eval/redteam.json`, `tests/eval/run-redteam.mjs`)
- **Target:** `@envoy/core` `checkOutbound()` · **Date:** `2026-11-22` · **Cases:** `28` adversarial bypass payloads + `2` clean controls.
- **Before PR #11 hardening:** `11 / 28` blocked (`39.3%`), `17` bypasses reported in [Issue #7](https://github.com/hesham88/envoy/issues/7).
- **After PR #11 hardening (current `main`):** **`17 / 28` attacks blocked (`60.7%`)**, **`11` remaining bypasses**, **`2 / 2` clean controls passed (`0` false blocks)**.
  - **Newly blocked by PR #11 (6 bypasses closed):** zero-width space in names (`rt-01`), soft hyphen in emails (`rt-03`), Cyrillic homoglyphs in names (`rt-05`), full-width digits & Latin (`rt-07`, `rt-08`, `rt-09`).
  - **Remaining 11 bypasses (tracked in [Issue #7](https://github.com/hesham88/envoy/issues/7)):** digits/amounts spelled in words (`rt-10`, `rt-11`, `rt-12`), mid-word line split (`rt-14`), Base64 (`rt-17`, `rt-18`), reversed strings (`rt-19`, `rt-20`), defanged email (`rt-23`), hyphen-spaced key token (`rt-27`), NFD combining accents (`rt-28`).

### 3.4 Secrets & CustomRule Evaluation (`tests/eval/run-secrets.mjs`)
- **Target:** `@envoy/core` `scanText()` (`SECRET` + `CustomRule`) · **Date:** `2026-11-22` · **Cases:** `n = 24` (`16` runtime-constructed key-shaped positives + `8` negative controls; zero secret literals committed).
- **Measured result:** **`100.0%` Recall (`16 / 16`)**, **`94.1%` Precision (`16 / 17`)**, **`6 / 6` CustomRule tests passing**.
- **1 precision finding tracked in [Issue #7](https://github.com/hesham88/envoy/issues/7):** `neg-07-env-template-empty` (`VITE_FIREBASE_API_KEY=\nAUTH_TOKEN=""`) matches across `\n`.

---

## 4. Answer Quality vs. Privacy — PAPILLON-Style Trade-Off (Milestone 4)

- **Runner:** `tests/eval/run-quality.mjs` · **Cloud reasoning & judge model:** **`gemini-3.5-flash-lite`** via Firebase AI Logic (`ONLY_IN_CLOUD` + App Check) · **Date:** `2026-11-22` · **`n = 10 / 20`** `[PARTIAL n=10/20]`.

| Arm *(Measured `2026-11-22`, `n = 10`, judge `gemini-3.5-flash-lite`)* | Envoy Score | Raw-Doc Ceiling | **Answer Quality Retained** | Right Clause Cited % | Correct / Partial / Wrong | Exact Re-ID / Attr Inf |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Envoy (`nano`: Default Gemini Nano `2025.8.21.1028`)** | **100.0%** | 100.0% | **100.0%** | **100.0%** | **10 / 0 / 0** | **0.0% / 0.0%** |
| **Envoy (`gemma4`: Gemma 4 `2026.11.3.1140`)** | **100.0%** | 100.0% | **100.0%** | **100.0%** | **10 / 0 / 0** | **0.0% / 0.0%** |
| **Envoy (`basic`: Rules + Guard)** | **100.0%** | 100.0% | **100.0%** | **100.0%** | **10 / 0 / 0** | **0.0% / 9.7%** |

---

## 5. `envoy-guard` CLI Hook (`packages/cli`, Milestone 6)

- **Package:** `@envoy/cli` (`packages/cli/dist/cli.mjs` → bin `envoy-guard`), rules-only **Basic protection** using `@envoy/core` `scanText()` + `~/.envoy/rules.json` (`CustomRule[]`).
- **Verified agent hook contracts (`2026-11-22`):**
  - **Claude Code:** `UserPromptSubmit` (blocks with finding summary + ready-to-paste masked copy; honestly documents that Claude Code cannot rewrite prompts inline) and `PreToolUse` (`WebFetch|Bash|Write|Edit` → `permissionDecision: "deny"`).
  - **Gemini CLI:** `BeforeAgent` and `BeforeTool` (`web_fetch|run_shell_command|write_file|replace` → strict JSON `{"decision": "deny"|"allow"}`).
- **`envoy-guard init claude|gemini`:** Prints the exact `.claude/settings.json` or `.gemini/settings.json` snippet without editing user settings automatically.
- **Tests:** `packages/cli/src/hook.test.ts` (**9 / 9 passing**) + live stdin→stdout binary verification.

---

## 6. Limitations

1. **CPU latency on 2018 laptop hardware (`i7-8750H`, CPU-only backend because 2016 Pascal GTX 1050 Ti crashes Dawn):** `p50` is `54.9s` (`gemma4`) / `67.5s` (`nano`); modern GPU-backed Chrome systems run on-device prompts in ~1–4s.
2. **Remaining 11 guard obfuscation bypasses & 8 Basic `flagNames` leaks:** Tracked transparently in [Issue #7](https://github.com/hesham88/envoy/issues/7) (6 of 17 guard bypasses already closed in PR #11).
3. **Cloud attack & quality sample size (`n = 12` / `n = 10`):** Paced for Gemini Developer API Free Tier RPM limits; clearly labeled partial alongside the full `36/36` pipeline matrix.

---

## Appendix A — Oracle Model (Upper Bound) *(Synthetic Gold Ceiling — NOT a Real Model)*

*Computed purely in-memory by `tests/eval/run.mjs` from gold labels across all 36 cases (`263` gold items). Excluded from `tests/eval/summary.json` `arms[]` and never called Nano.*

- **Oracle model (upper bound) + Envoy Layered:** `0 / 263` outbound leaks (`0.00%`), `minimizationRatio = 42.7%` (`57.3%` character reduction).
