# Run Envoy with your own Firebase project and models

Envoy is open source (Apache-2.0) and has no server of its own, so you can run the whole thing on your own Firebase project, with your own keys, your own quota and the cloud models you choose. This guide covers what works today with no code changes.

**What stays the same whatever you choose:** the private steps (finding details, choosing the clauses a question needs, deciding where to answer, answering locally) always run on the device with `InferenceMode.ONLY_ON_DEVICE`, behind the device guard. They never use your cloud model. Changing the cloud model changes **who reasons over the masked excerpt**, not **what leaves the device**: the guard, the approval card and the receipt work the same way.

## 1. Your own Firebase project

1. Create a Firebase project and add a **Web app**. Copy its config into `apps/web/.env.local` (start from [`apps/web/.env.example`](../apps/web/.env.example); `.env.local` is gitignored, never commit it):

   ```sh
   cp apps/web/.env.example apps/web/.env.local
   firebase apps:sdkconfig WEB <your-app-id> --project <your-project>
   ```

2. **Firebase AI Logic:** in the Firebase console, open AI Services > AI Logic and set up the **Gemini Developer API** (works on the no-cost Spark plan) or Vertex AI (Blaze). Envoy uses `GoogleAIBackend` (`packages/ai/src/firebase.ts`).
3. **App Check (required):** create a **reCAPTCHA Enterprise** website key (score type) for your domains, register it for the web app in Firebase console > App Check, and put it in `VITE_RECAPTCHA_SITE_KEY`. Then **enforce** App Check for Firebase AI Logic. It is not enforced by default: in the App Check API the service is `firebaseml.googleapis.com`. Test it: a request without a token should get HTTP 401.
4. **Local development:** register an App Check debug token in the console and put it in `VITE_APPCHECK_DEBUG_TOKEN`. Debug tokens are used only by development builds; `npm run check:dist` and `apps/web/src/env.test.ts` fail a release build that contains one.
5. **Lock the browser API key** (Google Cloud console > APIs & Services > Credentials):
   - HTTP referrers: your hosting domains and `http://localhost:5173/*`;
   - APIs: Firebase AI Logic (`firebasevertexai.googleapis.com`), App Check, Installations and Remote Config.

   Google matches `*` only at the start of a host name, so preview channels have to be added by name. [`scripts/allow-preview.mjs`](../scripts/allow-preview.mjs) shows how Envoy does it.

Then:

```sh
npm install
npm run dev      # http://localhost:5173
npm run verify   # lint, typecheck, tests (with eval:check) and build
```

## 2. Your choice of cloud model

The reasoning step is the only step that uses a cloud model. Envoy has two cloud model slots, set through **Remote Config** ([`remoteconfig.template.json`](../remoteconfig.template.json), deployed with `firebase deploy --only remoteconfig`):

| Parameter          | What it does                                                                                       | Envoy's value           |
| ------------------ | -------------------------------------------------------------------------------------------------- | ----------------------- |
| `cloud_model_fast` | The fast model ("Fast" in the composer). Runs with `PREFER_IN_CLOUD`.                              | `gemini-3.5-flash-lite` |
| `cloud_model`      | The more capable model. Runs `ONLY_IN_CLOUD`; if it refuses (quota, busy), the fast model answers. | `gemini-4-hydrogen`     |
| `cloud_default`    | Which of the two people get until they choose: `fast` or `capable`.                                | `fast`                  |
| `prompt_version`   | The on-device prompt version.                                                                      | `v1`                    |

- Put **any model ID that Firebase AI Logic serves for your project** in either slot, then publish the template. Remote Config changes reach users without a redeploy. If Remote Config can't be reached, the defaults in [`packages/ai/src/remote.ts`](../packages/ai/src/remote.ts) apply.
- **Check that the model is served before you switch to it.** Firebase AI Logic serves the models in its supported-models list for your API provider, and free-tier quotas are per project and per model. A model name used inside a coding tool is not necessarily available to apps.
- **For local testing**, `VITE_CLOUD_MODEL=<model-id>` in `.env.local` replaces the capable slot (`cloud_model`) for your dev build only.
- **Structured output:** the cloud model receives the same JSON schemas as the device (`responseJsonSchema`), so pick a model that supports structured output.
- **Arithmetic:** the cloud model is asked to write calculations as `{{TAG * factor}}` expressions, which Envoy evaluates on the device. It must keep tag names exactly as given; an unknown tag name is left unevaluated (EVAL §4 shows one case).

## 3. Your quota and your monitoring

- **Quota:** the Gemini Developer API's free tier is per project, per model and per day, and it resets at midnight Pacific; failed requests count too. Watch it on the Gemini API quotas page of your Google Cloud project.
- **Traffic without storing content:** the Firebase AI Logic API metrics page (requests, errors, latency) and Firebase console > App Check > APIs (verified vs refused requests) hold no prompt or reply text.
- **Firebase AI Logic Monitoring** stores the actual prompts and replies of sampled requests in Cloud Logging and Cloud Trace (30 days by default). Envoy only ever sends masked, approved text, but if you turn monitoring on, your privacy policy has to say that this text is kept. Envoy's own deployment leaves it off for that reason ([`FIREBASE_AI_LOGIC_REVIEW.md`](FIREBASE_AI_LOGIC_REVIEW.md)).

## 4. Hosting it, and the extension

- **Hosting:** `firebase deploy --only hosting` serves `apps/web/dist` with the headers in [`firebase.json`](../firebase.json). If you deploy your own copy, keep `connect-src` limited to the Firebase services you use, and change `frame-ancestors` to your own extension ID (or remove it if you don't ship the extension).
- **The extension:** its release build sends cloud questions to the hosted web app, because App Check can't attest an extension origin. To point it at your deployment, change `HOSTED_APP_URL` in [`apps/extension/src/env.ts`](../apps/extension/src/env.ts) and the guide link in `apps/extension/public/background.js`, then build and pack it under your own extension key.

## 5. Your own privacy rules

- **Your rules** (in the chat and the extension) mask words or patterns only you know are private, such as a client or project name. The guard enforces them on what leaves.
- To add a detector for everyone (a new ID format, say), add it to `packages/core/src/rules.ts` with tests, and add a case to `tests/eval/cases.json` so `npm run eval` measures it.

## What would need new code

The following are not built yet (planned after judging):

- **More than two cloud models in the picker:** a Remote Config list of `{id, label}`.
- **Token usage per answer:** the SDK returns token counts with each cloud reply, which could be shown in the flight recorder and the ledger.
- **A model check script:** list the models a project can call before offering them.
