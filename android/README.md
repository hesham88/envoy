# Envoy for Android

The same promise as the web app, on a phone: private steps run on the phone, only an excerpt you
approve leaves it, every detail in it is a tag, and real values come back on the phone.

| Step                              | Where it runs | How                                                                                                                       |
| --------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Find private details              | This phone    | Kotlin rules (a port of `@envoy/core`), plus Gemini Nano through Firebase AI Logic `ONLY_ON_DEVICE` when the phone has it |
| Keep only what the question needs | This phone    | Gemini Nano, `ONLY_ON_DEVICE`; without it, Basic protection sends every part, masked                                      |
| Check what leaves                 | This phone    | `Guard.checkOutbound`: any raw value, however written, blocks the send                                                    |
| Reason                            | Cloud         | Firebase AI Logic `ONLY_IN_CLOUD`, `gemini-3.5-flash-lite`, over the approved excerpt only                                |
| Restore and do the maths          | This phone    | Tags become real values; `{{RENT * 1.10}}` is computed here                                                               |
| Read aloud, dictate               | This phone    | Text-to-speech with an offline voice only; Android 12+ on-device speech recognizer only                                   |
| Text in a photo                   | This phone    | ML Kit text recognition (bundled model)                                                                                   |

## The device guard on Android

Before every private step, `FirebaseAIOnDevice.checkStatus()` must report `AVAILABLE`, or the step
doesn't run and Envoy says it is using Basic protection. After it, `response.inferenceSource` must be
`ON_DEVICE`, or the answer is discarded (`ai/EnvoyAi.kt`). The cloud model is a separate
`ONLY_IN_CLOUD` model that only ever receives the approved, tagged excerpt.

## Parity with the web engine

`scripts/export-android-fixtures.mjs` runs the TypeScript engine on the five sample documents and a
set of edge cases and writes `app/src/test/resources/parity.json`. `ParityTest` requires the Kotlin
rules to find exactly the same details, at the same offsets, and the Kotlin guard to catch the same
raw values. Run `./gradlew testDebugUnitTest`.

## Build

```
# Android SDK 35 and JDK 17+; on the dev machine the SDK, Gradle cache and AVDs live on F:
./gradlew testDebugUnitTest assembleDebug
```

Cloud: place this project's `google-services.json` in `app/` (never committed). Debug builds use the
App Check debug provider; register the token it logs on first run in the Firebase console. Without
the file, the app still runs every private step and says the cloud isn't set up.

## Known limits (honest)

- Tested on the Android emulator, which has no AICore: there, Envoy runs Basic protection (rules),
  checks what leaves, reasons in the cloud and restores. Gemini Nano on a phone with AICore has not
  been verified on hardware.
- Firebase AI Logic on-device inference on Android is an Experimental public preview: English and
  Korean are validated, about 4,000 tokens per request, foreground only.
- ML Kit reports usage metrics (not image content) to Google under its own terms.
- Answers questions in the cloud only; the web app also answers some questions on the device alone.
