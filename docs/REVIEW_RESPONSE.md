# What we did with each review point

Status as of 23 November 2026. ✅ done (with where), ⚠️ owner step or partly done, ❌ not done (with why).

## First judge review (ChatGPT, 7.75/10)

| Point | Status |
| --- | --- |
| Live privacy inspection panel | ✅ Privacy flight recorder on every answer: each step, where it ran, which model, time, characters sent (`packages/app/src/chat/FlightRecorder.tsx`); network ledger of every request |
| Real inference-source indicators | ✅ every private step must report `inferenceSource === ON_DEVICE` or it's discarded; the recorder shows the source and the cloud model by name |
| Approval before transmission | ✅ nothing is sent until you approve the exact text in the approval card (tested: `ChatApp.test.tsx`) |
| Privacy leakage evaluation | ✅ 36 cases × 3 setups, 0 raw details after the guard on all three; re-identification and attribute attacks; red team 28/28 (`docs/EVAL.md`) |
| Offline / local-only mode | ✅ Local only (no cloud call); questions the document answers are answered on the device; offline banner |
| Before/after request comparison | ✅ at the top of the approval card, plus the document view |
| Architecture documentation | ✅ README: diagram, the call sites with line links, the guard, what Envoy promises and doesn't |
| Automated tests and benchmarks | ✅ 304 unit/integration tests, `npm run eval`, extension end-to-end suite on the real build (20/20: text box, rich editor, password fields, text/photo/PDF upload, message security, side panel) |
| "Does privacy actually hold?" (logs, analytics, errors, history) | ✅ no analytics or logs leave the device; history is encrypted on the device; errors show only local text |
| A three-minute video structure | ⏳ waiting for your go-ahead (script and narration lines are drafted) |

## Second judge review (ChatGPT, 3.9/5)

| Point | Status |
| --- | --- |
| A. Red team 20/28 not good enough | ✅ 28/28, with false-positive checks; every case is a unit test (`packages/core/src/guard-redteam.test.ts`) |
| A. Uncertain cases should fail closed | ✅ text the guard can't read (an encoded blob) is blocked; tags inside links in answers are never restored |
| A. Don't claim "never leaves" | ✅ README "What Envoy promises, and what it doesn't"; scene and seal copy fixed |
| B. Latency 55–67 s | ⚠️ partly: detection only in the clauses the question needs (the measured setup), warm-up on focus, a cache for repeated questions, "Don't wait: use Basic protection", live timer. Combining the three on-device calls into one needs a model re-measurement before it can ship. Times vary a lot by device, and the README says so |
| B. Benchmark on a GPU | ❌ this machine's GPU can't run Chrome's model (it crashes the GPU backend); not claimed anywhere |
| B. Warm and cold latency | ✅ 5-run check: 250 s cold (busy machine), 89–100 s warm (`tests/eval/probes/fallback-check-5-runs.json`) |
| C. False masks 18–23% | ⚠️ unchanged on the model setups; heading words and line-break names fixed in Basic (now 10.9%); every mask can be undone in the approval card |
| D. Basic ≠ Private, say so before sending | ✅ the approval card states which protection produced the excerpt and what that means |
| Global fetch interception (concurrency) | ✅ one queue for every model call, with concurrency tests |
| Intermittent fallback to Basic | ✅ fixed and verified: 5/5 runs stayed Private (`docs/PLAN.md`) |
| More realistic attacks (prompt injection, reconstruction, encodings) | ✅ injection test end to end; exfiltration through restored links closed; encodings in the red team. ⚠️ combined-attribute re-identification is measured on 12 cases (Argon is extending) |
| Gemini Nano 4 compliance | ✅ explained in the README: Nano 4 is built on Gemma 4 (`gemma4_component`, measured); Chrome's default today is Nano 3 (also measured); Envoy runs on whichever Chrome provides |
| Don't name an unverifiable model in the UI | ✅ "Chrome's built-in model" everywhere |
| Extension: verify on real sites, don't distract from the web app | ✅ end-to-end suite on the real build; the extension's side panel is the same web chat |
| README behind the implementation | ✅ already fixed before this review (the review read an old snapshot); now also the measured table |
| Cloud model quota for judges | ⚠️ `gemini-4-hydrogen` (no billing required) via Remote Config; check the quota before judging |
| Positioning: selective delegation, minimum disclosure | ✅ README intro |

## Argon's winning-strategy audit

| Point | Status |
| --- | --- |
| Cloud steps need console setup | ✅ done earlier; cloud answers verified through the app and the extension |
| CPU latency: warm-up, per-step progress | ✅ warm-up on focus; live per-step progress and timer |
| `/dev` on-device test used the JSON model | ✅ uses `answerLocal` |
| README table of call sites with line links | ✅ |
| #10635 as the signature engineering moment | ✅ README "We don't trust the default" + `/dev` simulate button |
| Real eval numbers | ✅ `docs/EVAL.md`, `tests/eval/summary.json`, landing page |
| "Why not just redact?" | ✅ README |
| Basic protection first-class | ✅ |
| Replay a recorded on-device run for judges without the model | ⏳ waiting for Argon's recorded traces |

## PAIR quick wins

| Point | Status |
| --- | --- |
| Show the on-device model's reasons (selection, route) | ✅ in the flight recorder |
| Local route: don't show "what the cloud will see" | ✅ answered on the device, no approval card |
| Eval structured as rules vs model vs layered | ✅ |
| PAIR vocabulary and interaction policies in the README | ✅ |
