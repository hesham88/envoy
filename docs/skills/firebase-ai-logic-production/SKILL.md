---
name: firebase-ai-logic-production
description: "Production-readiness review for apps using Firebase AI Logic (firebase/ai), especially hybrid on-device + cloud web apps. Use before a launch, a hackathon submission or a security review, when asked to 'check the production checklist', 'harden Firebase AI Logic', 'restrict the API key', 'App Check for AI Logic', 'Remote Config model name', 'AI monitoring', 'quotas or rate limits for Gemini', or 'which Gemini model for production'. Produces a checklist table with evidence (file:line) and owner steps."
---

# Firebase AI Logic: production readiness

Source: the official [production checklist](https://firebase.google.com/docs/ai-logic/production-checklist) and [hybrid guide](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started), read 2026-11-23. For hybrid API details use the `firebase-ai-logic-hybrid` skill.

## How to run the review

1. Read the code that creates the AI instance (`getAI`), the models (`getGenerativeModel`), App Check and Remote Config. Cite each finding as `file:line`.
2. Go through every item below. Mark ✅ (done, with evidence), ⚠️ (owner step in a console), ❌ (gap in code).
3. Write the result to a doc (Envoy keeps it in `docs/FIREBASE_AI_LOGIC_REVIEW.md`) and list the owner steps at the end. Never change console settings yourself: they're the owner's.

## The checklist

| Area | What good looks like | How to check |
| --- | --- | --- |
| Projects | Separate dev/test/prod Firebase projects | `.firebaserc`, env files |
| App Check | reCAPTCHA Enterprise on web; enforced for AI Logic (automatic since 2 Nov 2026); `useLimitedUseAppCheckTokens: true`; debug token only in development builds and never in a shipped bundle | `initializeAppCheck`, `getAI` options; grep the production bundle for the debug token |
| API key | HTTP-referrer restriction to the real domains; API allowlist with `firebasevertexai.googleapis.com` plus only the Firebase APIs used (App Check, Remote Config, Installations) | Google Cloud console > Credentials (owner) |
| Authenticated-users mode | Optional: requests need Firebase Auth or fail with 401 | Only if the app has accounts |
| Models | Stable IDs only (no `-preview`, `-exp`, `-latest`); the model name comes from Remote Config so it can change without a release | `inCloudParams.model`, Remote Config template |
| Remote Config | A versioned template in the repo, deployed with `firebase deploy --only remoteconfig` | `firebase.json` `remoteconfig.template` |
| Monitoring | AI monitoring on (requests, latency, tokens, errors). It sees cloud calls only, never on-device inference | Firebase console > AI Logic (owner) |
| Limits | Per-user rate limit (default 100 RPM) and project quotas fit the expected load | Google Cloud console quotas (owner) |
| Spend | Budget alerts and caps on Blaze | Billing console (owner) |
| Hybrid specifics | `inferenceSource` checked; private steps can't silently use the cloud (SDK issue #10635: guard `ONLY_ON_DEVICE` with an availability check and a network tripwire); on-device prompts under ~9,216 tokens; single-turn on device | Code review plus a test that blocks cloud calls during private steps |
| Privacy | What reaches the cloud is shown to the user, and the shipped bundle has no secrets | Bundle scan; UI review |

## Output

A table like the one above with ✅ / ⚠️ / ❌, evidence for each line, and a short numbered list of owner steps.
