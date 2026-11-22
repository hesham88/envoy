# Envoy — Empirical Evaluation & Harness² Report

*Phase 5 Evaluation Harness (`tests/eval/cases.json` · `tests/eval/collect-live.mjs` · `tests/eval/run.mjs` · `tests/eval/run-answers.mjs` · `scripts/probe-pipeline.mjs`). Structured per [BRIEF.md §8](BRIEF.md), the [Google PAIR People + AI Guidebook](PAIR_GUIDEBOOK_STRATEGY.md) (Chapters 1–2), [Harness²](skills/harness2/SKILL.md), and the **Model under test** rule in [PLAN.md](PLAN.md).*

> **Model Under Test & Scope Disclosure (2026-11-22):**
> - **On-device model measured here:** **Gemma 4 (`gemma4_component` version `2026.11.3.1140`)**, running on Chrome 158 (`F:\ChromeEnvoy`, `--enable-features=OnDeviceModelForceCpuBackend,OnDeviceModelCpuBackend`, developer-trial flag `gemma4-for-built-in-ai` enabled, Intel Core i7-8750H CPU).
> - **Important caveat:** Judges on standard Chrome without the developer-trial flag will likely receive the **default Gemini Nano** component rather than `gemma4_component`. All headline numbers below are explicitly labeled **Gemma 4 (`gemma4_component 2026.11.3.1140`)**; testing on a separate default-Nano profile (`F:\ChromeEnvoyNano`, flag off) is the next planned comparison.
> - **Cloud reasoning model measured here:** **`gemini-3.5-flash-lite`** via **Firebase AI Logic (`GoogleAIBackend`)** authenticated with **Firebase App Check**.
> - **Measured case count:** **14 / 36 benchmark cases** (`121` gold sensitive items across all 6 document categories: 10 clean + 4 noisy stress cases) were executed **live** on `2026-11-22` and stored unaltered in `tests/eval/probes/nano-cache.json` (`source: "live"`). The remaining **22 / 36 cases** are unmeasured and **excluded** from all headline tables below. No synthetic model outputs exist in `nano-cache.json`.

---

## 1. Headline Measured Results (14 / 36 Live Cases · `2026-11-22`)

**On-device model:** **Gemma 4 (`gemma4_component 2026.11.3.1140`, CPU backend, `detectScope: 'selected'`)**
**Dataset:** 14 live-measured cases (`121` gold sensitive items · `12,694` raw document chars · `74` clauses)

To disaggregate the exact contribution of each layer (per PAIR Ch. 2.3), `npm run eval` compares three conditions over the identical 14 live-measured cases:

1. **Rules Alone:** Deterministic regex & checksum detectors (`packages/core/src/rules.ts`: 14-digit Egyptian national ID, mod-97 IBAN, Luhn card, E.164/`+20` phones, emails, currency amounts, dates, Arabic-Indic digit normalizer) over the full document (`100%` of clauses sent).
2. **On-Device LLM Alone — Gemma 4 (`gemma4_component 2026.11.3.1140`):** Raw live on-device outputs (`minimize`, `detect`, `route`) without deterministic rules, name heuristics, or the Outbound Guard.
3. **Envoy Layered (`Rules + Gemma 4 (gemma4_component 2026.11.3.1140) + Name Fallback + Outbound Guard`):** Full layered architecture combining deterministic rules, live Gemma 4 outputs, name fallback, and hard-blocking `checkOutbound` verification before transmission.

| Condition *(Measured `2026-11-22`, 14 live cases · 121 gold items)* | PII Leakage % *(Lower is better)* | Privacy Recall % *(Higher is better)* | Zero-Leak Cases % | Context Reduction % *(Higher is better)* | Clauses Sent % | Target Clause Recall % | Route Accuracy % |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Rules Alone** *(Deterministic regex + checksums)* | **24.79%** *(30 / 121)* | 75.21% | 0.0% *(0 / 14)* | −8.0% *(tags expand full doc)* | 100.0% | 100.0% | n/a *(always cloud)* |
| **2. On-Device LLM Alone** *(Gemma 4 `gemma4_component 2026.11.3.1140`)* | **4.13%** *(5 / 121)* | 95.87% | 85.7% *(12 / 14)* | **79.7%** | 14.9% | 78.6% *(11 / 14)* | 35.7% *(5 / 14)* |
| **3. Envoy Layered** *(Rules + Gemma 4 `2026.11.3.1140` + Guard)* | **0.00%** *(0 / 121)* | **100.00%** | **100.0%** *(14 / 14)* | **85.0%** | **12.2%** | 78.6% *(11 / 14)* | 35.7% *(5 / 14)* |

### Key Measured Takeaways (Real-Model Evidence)
- **Why Rules Alone is insufficient:** Deterministic rules leak **24.79% (`30/121`)** of sensitive items (unstructured person names and addresses) and transmit **100% of document clauses** (`-8.0%` context reduction).
- **Why On-Device Gemma 4 Alone is insufficient:** When `Gemma 4 (gemma4_component 2026.11.3.1140)` accidentally included Clause 1 in `offer-01-severance-calculation` (`selected: [1, 2, 5]`), it leaked **4 structured secrets** (`NATIONAL_ID: 29605210104321`, `PHONE: +20 101 333 8899`, `EMAIL: salma.mostafa@example.com`, `DATE: 1 November 2025`), plus `DATE: 1 September 2024` in `lease-02-end-date-local` (**4.13% leakage, 5/121**), because its `DETECT_SCHEMA` covers `PERSON | ORG | ADDRESS | MONEY` rather than structured IDs/phones/emails/dates.
- **Why Envoy Layered achieves 0.00% leakage (`0/121`) and 85.0% context reduction:** Deterministic rules masked all 4 structured secrets in `offer-01` and the date in `lease-02` cleanly, and on `med-01-fasting-glucose-threshold` — where Gemma 4 mis-tagged `"114 mg/dL"`, `"5.9%"`, and `"3 months"` as `MONEY` — the deterministic **Outbound Guard (`checkOutbound`) hard-blocked transmission** (`guardOk: false`, `3` overlapping items caught) rather than risking an unmasked leak.
- **Honest Prompt Bottlenecks Uncovered on Real Gemma 4 (`v1` prompts):**
  - **Over-routing to local (`35.7%` route accuracy, `5/14`):** On `v1` `buildRoutePrompt`, `Gemma 4 (2026.11.3.1140)` routed 7 multi-step/calculation questions to `answerable_locally: true` (e.g., `freelance-01-kill-fee`, where it also omitted Clause 2's `USD 6,000` milestone fee and answered with the 50% rule rather than computing `USD 3,000`), while sending 2 simple lookups (`lease-02`, `offer-03`) to the cloud.
  - **Target clause recall (`78.6%`, `11/14`):** Missed Clause 3 in `offer-03`, Clause 2 in `freelance-01`, and Clause 3 in `noisy-04`. Tightening `buildRoutePrompt` (higher precision on `answerable_locally: true`) and testing on default Gemini Nano are our top v2 Harness² targets.

---

## 2. Disaggregated Measured Breakdown: Clean vs. Noisy Cases (`14` Live Cases)

| Subset *(Measured `2026-11-22`, Gemma 4 `gemma4_component 2026.11.3.1140`)* | Live Cases | Gold Items | Rules Alone Leakage % | Gemma 4 Alone Leakage % | Envoy Layered Leakage % | Envoy Context Reduction % | Guard Blocks |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Clean Standard Cases** *(Leases, Offers, Medical, Consulting, Financial)* | 10 | 103 | 20.39% *(21 / 103)* | 4.85% *(5 / 103)* | **0.00%** *(0 / 103)* | **85.8%** | 1 (`med-01`) |
| **Noisy Stress Cases** *(Arabic-Indic `٠–٩`, postfix `LE`/`EGP`, ALL-CAPS, PII in question)* | 4 | 18 | 50.00% *(9 / 18)* | 0.00% *(0 / 18)* | **0.00%** *(0 / 18)* | **77.0%** | 0 |
| **All Measured Live Cases** | **14** | **121** | **24.79%** *(30 / 121)* | **4.13%** *(5 / 121)* | **0.00%** *(0 / 121)* | **85.0%** | **1** |

---

## 3. Per-Case Live Provenance Table (All 36 Cases in `tests/eval/cases.json`)

Every case below is explicitly marked as **`live`** (measured on `2026-11-22` on **Gemma 4 `gemma4_component 2026.11.3.1140`, CPU backend**) or **`unmeasured`** (not yet collected live; excluded from all headline tables).

| # | Case ID | Category | Status | Model (`component version`) | Total On-Device Latency | Selected Clauses *(Expected)* | Local Route *(Expected)* | Gemma 4 Alone Leaks | Envoy Layered Leaks | Guard |
| :---: | --- | --- | :---: | --- | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | `lease-01-rent-cap` | residential_lease | **live** (`2026-11-22`) | Gemma 4 (`gemma4_component 2026.11.3.1140`) | 81.2 s | `[7]` *(`[7]`)* | `false` *(`false`)* | 0 | 0 | pass |
| 2 | `lease-02-end-date-local` | residential_lease | **live** (`2026-11-22`) | Gemma 4 (`gemma4_component 2026.11.3.1140`) | 85.7 s | `[2, 10]` *(`[2]`)* | `false` *(`true`)* | 1 (`DATE`) | 0 | pass |
| 3 | `lease-03-early-exit-deposit` | residential_lease | **live** (`2026-11-22`) | Gemma 4 (`gemma4_component 2026.11.3.1140`) | 119.7 s | `[6, 10]` *(`[6, 10]`)* | `true` *(`false`)* | 0 | 0 | local |
| 4 | `lease-04-late-fee-grace-period` | residential_lease | **live** (`2026-11-22`) | Gemma 4 (`gemma4_component 2026.11.3.1140`) | 82.9 s | `[8]` *(`[8]`)* | `false` *(`false`)* | 0 | 0 | pass |
| 5 | `lease-05-sublet-policy` | residential_lease | **live** (`2026-11-22`) | Gemma 4 (`gemma4_component 2026.11.3.1140`) | 85.9 s | `[3]` *(`[3]`)* | `true` *(`false`)* | 0 | 0 | local |
| 6 | `offer-01-severance-calculation` | employment_contract | **live** (`2026-11-22`) | Gemma 4 (`gemma4_component 2026.11.3.1140`) | 154.5 s | `[1, 2, 5]` *(`[2, 5]`)* | `false` *(`false`)* | 4 (`ID,PHONE,EMAIL,DATE`) | 0 | pass |
| 7 | `offer-03-probation-period-local` | employment_contract | **live** (`2026-11-22`) | Gemma 4 (`gemma4_component 2026.11.3.1140`) | 53.2 s | `[2]` *(`[3]`)* | `false` *(`true`)* | 0 | 0 | pass |
| 8 | `med-01-fasting-glucose-threshold` | medical_report | **live** (`2026-11-22`) | Gemma 4 (`gemma4_component 2026.11.3.1140`) | 68.4 s | `[3, 4]` *(`[3, 4]`)* | `false` *(`false`)* | 0 | 0 *(blocked)* | **blocked (3)** |
| 9 | `freelance-01-kill-fee` | consulting_agreement | **live** (`2026-11-22`) | Gemma 4 (`gemma4_component 2026.11.3.1140`) | 64.8 s | `[4]` *(`[2, 4]`)* | `true` *(`false`)* | 0 | 0 | local |
| 10 | `loan-01-early-payoff-penalty` | financial_agreement | **live** (`2026-11-22`) | Gemma 4 (`gemma4_component 2026.11.3.1140`) | 63.0 s | `[2, 3]` *(`[3]`)* | `true` *(`false`)* | 0 | 0 | local |
| 11 | `noisy-01-arabic-indic-digits-lease` | noisy_stress | **live** (`2026-11-22`) | Gemma 4 (`gemma4_component 2026.11.3.1140`) | 64.2 s | `[2]` *(`[2]`)* | `true` *(`false`)* | 0 | 0 | local |
| 12 | `noisy-04-postfix-currency-le-egp` | noisy_stress | **live** (`2026-11-22`) | Gemma 4 (`gemma4_component 2026.11.3.1140`) | 63.2 s | `[2]` *(`[2, 3]`)* | `true` *(`false`)* | 0 | 0 | local |
| 13 | `noisy-05-all-caps-and-titled-names` | noisy_stress | **live** (`2026-11-22`) | Gemma 4 (`gemma4_component 2026.11.3.1140`) | 65.9 s | `[2]` *(`[2]`)* | `true` *(`false`)* | 0 | 0 | local |
| 14 | `noisy-06-pii-in-user-question` | noisy_stress | **live** (`2026-11-22`) | Gemma 4 (`gemma4_component 2026.11.3.1140`) | 55.0 s | `[2]` *(`[2]`)* | `false` *(`false`)* | 0 | 0 | pass |
| 15–36 | Remaining 22 cases in `cases.json` | lease/offer/med/freelance/noisy | **unmeasured** | — | — | — | — | — | — | — |

*(Unmeasured IDs: `lease-06`..`08`, `offer-02`, `offer-04`..`06`, `med-02`..`04`, `freelance-02`..`04`, `loan-02`, `noisy-02`, `noisy-03`, `noisy-07`..`12`. Run `node tests/eval/collect-live.mjs` against Chrome CDP to append additional live measurements.)*

---

## 4. Real-Model Stability & Harness² Probes (`tests/eval/probes/`)

All probes below ran live on **Gemma 4 (`gemma4_component 2026.11.3.1140`, CPU backend)** via `scripts/probe-pipeline.mjs` (which auto-resolves `/@fs/` imports from the target Vite dev server so it runs cleanly across any worktree without HTTP 403 errors):

| Probe / Trace File | Model (`component version`) | Date | Measured Result |
| --- | --- | :---: | --- |
| `baseline-all.json`, `baseline-all-2.json` | Gemma 4 (`gemma4_component 2026.11.3.1140`) | `2026-11-22` | Before `withSessionCleanup`, consecutive full-doc runs fell back to Basic mid-run (`model_crash_count: 2/3`) due to `@firebase/ai` `ChromeAdapterImpl.oldSession` KV-cache retention. |
| `probe-selected.json` | Gemma 4 (`gemma4_component 2026.11.3.1140`) | `2026-11-22` | With `detectScope: 'selected'` + `withSessionCleanup`: `detect` dropped **5.0×** (`57,831 ms` → `11,519 ms`), `selected: [7]`, `charsSent: 235`, `guardOk: true`. |
| `probe-selected-q2-local.json` | Gemma 4 (`gemma4_component 2026.11.3.1140`) | `2026-11-22` | Q2 (*"When does my contract end?"*): `selected: [2, 10]`, `route.local: true` (`0 bytes` sent); uncovered generic role nouns (`"Landlord"`, `"Tenant"`), leading to the `GENERIC_ROLE_NOUN` parser filter. |
| **`stability-3runs-selected.json`** | Gemma 4 (`gemma4_component 2026.11.3.1140`) | `2026-11-22` | **3-run consecutive fresh-page stability probe:** **`3 / 3 (100%)` Private**, `0 / 3` Basic, `avail: available→available`, `selected: [7]`, `guard: true`, `fallback: none`, latencies `108.5s`, `92.7s`, `61.6s` (avg `87.6s` on CPU). |

---

## 5. Measured Live Answer Quality & Local Restoration (`tests/eval/answer-quality.json`)

Executed on **`2026-11-22`** over the **10 live-measured benchmark questions** that belong to the 20-question quality rubric (`6` cloud-routed to **`gemini-3.5-flash-lite`** via Firebase AI Logic + App Check; `4` answered locally on-device by **Gemma 4 `gemma4_component 2026.11.3.1140`** with `0 bytes` sent):

| Automated Gate *(10 live-measured rubric cases · `2026-11-22`)* | Measured Result | Details |
| --- | :---: | --- |
| **Zero Cloud PII Leak (`guard.ok` or `0 bytes` local)** | **9 / 10 (90%)** *(10/10 protected)* | 9 clean; `med-01` hard-blocked by Outbound Guard (`guardOk: false`) before sending |
| **Clean Tag & Expression Restoration (`0` leftover `[TAG]` / `{{...}}`)** | **10 / 10 (100%)** | Lifted from `17/20` → `100%` via strict-tag guardrail forbidding invented `{{...}}` names |
| **Local `{{EXPR}}` Math Evaluation** | **9 / 10 (90%)** | Live cloud + local restore verified `{{RENT * 0.10}}` → **`EGP 850`** (`lease-01`) and `{{SALARY * 2}}` → **`EGP 130,000`** (`offer-01`); `freelance-01` routed locally without Clause 2's amount |
| **Ground-Truth Fact Match** | **8 / 10 (80%)** | 6/6 cloud answers matched; 2/4 local Gemma 4 answers (`lease-05`, `loan-01`) matched all gold facts while `lease-03` & `freelance-01` gave partial 1-clause local answers |
| **Average Live Cloud Latency (`gemini-3.5-flash-lite` + App Check)** | **`4,549 ms`** | Measured end-to-end via `firebasevertexai.googleapis.com` with exchanged App Check JWT |

| # | Case ID | Route & Model | Clauses Sent | Live Measured Answer (Restored locally on device) | Gates Passed |
| :---: | --- | --- | :---: | --- | :---: |
| 1 | `lease-01-rent-cap` | `in_cloud` (`gemini-3.5-flash-lite`) | 1 / 12 (`[7]`) | No, your landlord cannot raise the rent 20% this year. Permitted increase is capped at **EGP 850** (`{{RENT * 0.10}}`, 10%). | **PASS** |
| 2 | `lease-02-end-date-local` | `in_cloud` (`gemini-3.5-flash-lite`) | 2 / 12 (`[2, 10]`) | Term of three (3) years starting 1 September 2024, ending 31 August 2027 (Clause 2). | **PASS** |
| 3 | `lease-03-early-exit-deposit` | `on_device` (`gemma4_component 2026.11.3.1140`) | 0 / 12 *(0 bytes)* | *"The Landlord may keep one month's rent from the deposit if the Tenant leaves before the end of the term without the notice required by Clause 10. Clause 6."* | Partial *(omitted 30-day return / EGP 17,000)* |
| 4 | `lease-04-late-fee-grace-period` | `in_cloud` (`gemini-3.5-flash-lite`) | 1 / 3 (`[8]`) | No, you do not owe the late fee if you pay on the 8th (applies only >10 days late, Clause 8). | **PASS** |
| 5 | `lease-05-sublet-policy` | `on_device` (`gemma4_component 2026.11.3.1140`) | 0 / 4 *(0 bytes)* | *"The Tenant may not sublet, assign, or list any room on short-term rental platforms without prior written authorization from the Landlord. (Clause 3)"* | **PASS** |
| 6 | `offer-01-severance-calculation` | `in_cloud` (`gemini-3.5-flash-lite`) | 3 / 5 (`[1, 2, 5]`) | Severance equals two months of gross monthly salary (**EGP 65,000**), expressed as **EGP 130,000** (`{{SALARY * 2}}`). | **PASS** |
| 7 | `offer-03-probation-period-local` | `in_cloud` (`gemini-3.5-flash-lite`) | 1 / 3 (`[2]`) | Probationary period is 90 days (Clause 3). | **PASS** |
| 8 | `med-01-fasting-glucose-threshold` | `in_cloud` *(blocked by Guard)* | 0 / 4 *(blocked)* | Outbound Guard caught 3 overlapping `MONEY`-tagged lab values (`114 mg/dL`, `5.9%`, `3 months`) and blocked sending. | Guard-blocked |
| 9 | `freelance-01-kill-fee` | `on_device` (`gemma4_component 2026.11.3.1140`) | 0 / 4 *(0 bytes)* | *"If the client cancels an active milestone after work has begun, the Client shall pay 50% of that milestone's fee within 14 days. (Clause 4)"* | Partial *(missed Clause 2 USD 6,000)* |
| 10 | `loan-01-early-payoff-penalty` | `on_device` (`gemma4_component 2026.11.3.1140`) | 0 / 3 *(0 bytes)* | *"The early-settlement administrative charge is 3% of the prepaid principal balance. (Clause 3)"* | **PASS** |

---

## 6. Reproducing the Evaluation

```bash
# 1. Evaluate all live-cached cases in tests/eval/probes/nano-cache.json (never writes synthetic entries)
npm run eval

# 2. Collect fresh LIVE on-device outputs from Chrome CDP (port 9333) with explicit component/version metadata
node tests/eval/collect-live.mjs --port 5174 --component gemma4_component --version 2026.11.3.1140 --label "Gemma 4"

# 3. Run a multi-run Private stability probe across any running worktree Vite server
node scripts/probe-pipeline.mjs --variant selected --runs 3 --out tests/eval/probes/stability-3runs-selected.json

# 4. Re-run live Firebase AI Logic cloud answer quality calls (requires App Check debug token in apps/web/.env.local)
node tests/eval/run-answers.mjs --live
```

---

## Appendix A — Oracle Model (Upper Bound) *(Synthetic Ceiling — NOT a Real Model)*

*This table is **not** a real on-device model and is **excluded** from all headline metrics above. It is computed purely in-memory by `tests/eval/run.mjs` using the gold labels (`goldSensitive`, `expectedClauses`, `expectedLocalRoute`) across all 36 cases (`263` gold items) solely to verify the theoretical ceiling of the Envoy Layered deterministic rules + tagger + guard code.*

| Theoretical Upper Bound *(36 cases · 263 gold items — synthetic gold oracle, NOT Gemini Nano / Gemma 4)* | PII Leakage % | Privacy Recall % | Context Reduction % | Clauses Sent % |
| --- | :---: | :---: | :---: | :---: |
| **Oracle model (upper bound) + Envoy Layered** | 0.00% *(0 / 263)* | 100.00% | 65.5% | 19.6% |
