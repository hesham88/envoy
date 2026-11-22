# How Envoy is measured

Envoy's claims are about what leaves your device, so every claim needs evidence you can rerun. There are two kinds:

1. **Automated tests** that check the privacy properties on every commit. They need no model and run in CI.
2. **Real-model evaluation**: the real pipeline (`analyze` and `answer` in `@envoy/ai`) through Firebase AI Logic hybrid inference, on a real on-device model in Chrome.

## 1. Checked on every commit

`npm run verify` (lint, typecheck, all tests, build) gates every commit and every pull request. The privacy properties it checks:

| Property | Where it's tested |
| --- | --- |
| A private step never reaches the cloud. If Chrome's model is missing, Envoy uses Basic protection; a cloud request during a private step is blocked and stops the run; a result not from the device is discarded. | [`packages/ai/src/device-guard.test.ts`](../packages/ai/src/device-guard.test.ts), [`packages/ai/src/pipeline.test.ts`](../packages/ai/src/pipeline.test.ts) |
| Nothing is sent before the user approves the exact text, and what's sent contains no raw names, IDs, emails or accounts from the sample. | [`apps/web/src/chat/ChatApp.test.tsx`](../apps/web/src/chat/ChatApp.test.tsx) |
| Local only never calls the cloud. | [`apps/web/src/chat/ChatApp.test.tsx`](../apps/web/src/chat/ChatApp.test.tsx) |
| The outbound guard blocks a raw value however it's reformatted: spacing, punctuation, zero-width characters, soft hyphens, bidi controls, full-width digits, Arabic-Indic digits, Cyrillic lookalikes. | [`packages/core/src/guard.test.ts`](../packages/core/src/guard.test.ts), [`packages/core/src/guard-unicode.test.ts`](../packages/core/src/guard-unicode.test.ts) |
| Secrets (provider API keys, private keys, JWTs, `password=` values) and the user's own rules are masked and enforced by the guard. | [`packages/core/src/scan.test.ts`](../packages/core/src/scan.test.ts) |
| Detectors validate what they find (IBAN checksum, Luhn for cards, the structure of Egyptian national IDs) to keep false alarms down. | [`packages/core/src/rules.test.ts`](../packages/core/src/rules.test.ts) |
| The App Check debug token can never be part of a production build. | [`apps/web/src/env.test.ts`](../apps/web/src/env.test.ts) |

## 2. Real-model evaluation

The eval harness (`tests/eval`, run with `npm run eval`) runs 36 cases through the real pipeline in the Chrome that has the on-device model. It measures:

- **Masking:** how many private details are found and masked, and how many harmless words are masked by mistake.
- **Leaks after the guard:** raw values in the text that actually leaves the device. The target is zero, and any non-zero result is reported with its case.
- **Re-identification attack:** the cloud model is given only what actually leaves the device and asked to recover each masked value. We report how often it succeeds.
- **Answer quality:** Envoy's answers compared with sending the whole document to the cloud, the privacy-utility trade-off that PAPILLON reports.
- **Cost of privacy:** time per step, and characters sent compared with the whole document.

Rules for every number: it comes from a real run, never from gold labels; it names the model (component and version from `chrome://on-device-internals`), the date and the number of cases; and it's reported separately for Gemma 4 (our development model, behind a developer-trial flag), Chrome's default Gemini Nano (what most people have), and Basic protection (no model). Firebase AI Logic doesn't report which on-device model Chrome used, which is why each run records it.

**Status:** the harness is being completed. Results publish to `tests/eval/summary.json`, which the [landing page](https://envoy-hybrid-ai.web.app/#guard) shows as soon as it exists, and in full in `docs/EVAL.md`. Until then, no measured figure is quoted anywhere in Envoy's materials.

## Reproduce

```sh
npm install
npm run verify        # every automated check above
```

Once the harness is merged: `npm run eval` reruns the evaluation from the committed real-run caches, and `npm run eval -- --live` re-collects against the on-device model (this needs the model Chrome; see docs/PLAN.md).
