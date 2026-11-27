# Envoy for Android on Google Play: sub-plan (FS-T19)

27 November 2026. Owner request: a full path to publish the Android companion on the Play Store.

## The constraint that shapes everything

- **Personal developer accounts created after 13 November 2023** must run a **closed test with at least 12 testers, opted in continuously for 14 days**, before they can apply for production access ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465)). Losing a tester resets the count.
- **Organisation accounts** (they need a D-U-N-S number) and older personal accounts are exempt.
- **What this means for the contest:**
  - With a new personal account, **a public production listing before Mon 30 Nov is not possible**. The realistic contest-window goal is an **internal test** (no review, up to 100 testers, live in minutes) plus the start of the **closed test**.
  - The public listing follows in about three weeks.
  - Judges keep the APK in the GitHub release and the demo film.

## Requirements found (Nov 2026)

| Requirement                                                                                                                                                               | Envoy today                                    | Action                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New apps must target Android 16 (API 36) ([target SDK](https://developer.android.com/google/play/requirements/target-sdk))                                                | targetSdk 35, compileSdk 36                    | Raise targetSdk to 36; test edge-to-edge and predictive back                                                                                                               |
| Native libraries must support 16 KB page sizes ([Android blog](https://android-developers.googleblog.com/2025/05/prepare-play-apps-for-devices-with-16kb-page-size.html)) | ML Kit text recognition ships native code      | Check in the App bundle explorer and with `zipalign -c -P 16`; update ML Kit if it isn't aligned                                                                           |
| Generative-AI apps need in-app reporting of offensive output ([policy](https://support.google.com/googleplay/android-developer/answer/14094294))                          | None                                           | Add "Report this answer" on the Answer step (it opens an email draft to the developer address with the _tagged_ answer only, never the restored values)                    |
| Android App Bundle, signed with an upload key; Play App Signing                                                                                                           | Debug APK only                                 | `bundleRelease` with an upload keystore kept outside the repo                                                                                                              |
| App Check in release: Play Integrity                                                                                                                                      | Release source set already uses Play Integrity | Register the **app signing key** SHA-256 (from Play Console) in Firebase; link the Play app to the Cloud project; add the release SHA-1 to the Android API key restriction |
| Privacy policy URL                                                                                                                                                        | https://envoy-hybrid-ai.web.app/privacy        | Add an Android section (on-device steps, what reaches Gemini, no accounts)                                                                                                 |
| Data safety form                                                                                                                                                          | —                                              | Declare as below                                                                                                                                                           |
| Content rating (IARC), target audience, ads, app access                                                                                                                   | —                                              | Questionnaires as below                                                                                                                                                    |

## Done in the repo (27 Nov)

- **targetSdk 36** (`android/app/build.gradle.kts`). Debug and release builds pass, and so does Google's release lint (lintVital).
- **Release signing:** read from `ENVOY_UPLOAD_KEYSTORE`, `ENVOY_UPLOAD_KEY_ALIAS`, `ENVOY_UPLOAD_STORE_PASSWORD` and `ENVOY_UPLOAD_KEY_PASSWORD`. Without them the bundle is unsigned, and nothing is in the repo.
- **`gradlew bundleRelease`** builds `app-release.aab` (30.6 MB).
- **16 KB pages:** every 64-bit native library (arm64-v8a, x86_64: androidx.graphics.path, datastore, ML Kit OCR) has 16 KB-aligned load segments. The 32-bit ML Kit copies are 4 KB-aligned, which 32-bit devices use. Checked by reading the ELF program headers in the bundle.
- **Report this answer** (owner chose an email draft, 27 Nov): on the Answer step it opens a draft to the developer address with the answer as the cloud wrote it (tags only; tested never to include restored details). If there is no email app, the screen says where to write. **Before Play:** decide whether `REPORT_ADDRESS` in `ui/Steps.kt` stays the commit-author address or becomes a dedicated one.
- **Decision (27 Nov):** the owner chose to skip Play during the contest. The app stays Play-ready for later.

## Steps

**Owner-only actions:** payment, identity, legal declarations and Play Console clicks. Claude prepares every file and text, and runs CLI steps after showing each command.

1. **Account (owner).**
   - Open or confirm a Google Play developer account under hesham1988@gmail.com: the $25 one-time fee and identity verification.
   - Tell Claude the account type (personal or organisation) and its creation date. That decides whether the 12-tester rule applies.
2. **App changes (Claude, one PR, `npm run verify` and the android CI job):**
   - `targetSdk = 36`; versionCode 1, versionName 0.1.0.
   - "Report this answer" (the AI-content policy), with a unit test that the report carries only the tagged text.
   - A release signing config read from environment variables (`ENVOY_UPLOAD_KEYSTORE`, `ENVOY_UPLOAD_KEY_ALIAS`, passwords from the environment; nothing in the repo).
   - The release `google-services.json` stays gitignored; CI builds the debug APK only.
3. **Upload key (owner runs it, Claude gives the command):** `keytool -genkeypair` into `F:/Android/keys/envoy-upload.jks`, which is backed up outside the repo. Claude never sees the passwords; they're typed in the owner's terminal.
4. **Build:**
   - `gradlew bundleRelease` gives `app-release.aab`.
   - Check 16 KB alignment (`zipalign -c -P 16 -v 4` on a universal APK from bundletool, and the App bundle explorer after upload).
   - Run on the emulator with the release config.
5. **Play Console app (owner clicks; Claude provides the text):**
   - Create the app "Envoy: private AI agent", app, free.
   - **App access:** all features without login.
   - **Ads:** no ads.
   - **Content rating:** IARC questionnaire (utility, no user-to-user communication, no gambling, no violence).
   - **Target audience:** 18+.
   - **News app:** no. **Health:** not a medical app (the lab-results sample is a document example only). **Financial features:** none. **Government app:** no.
   - **Data safety:**
     - No data shared with third parties for advertising.
     - "Messages or other user content": processed ephemerally, sent to Google's Gemini through Firebase AI Logic **only after the user approves, with private details replaced by tags**. Encrypted in transit; no account; nothing stored by Envoy.
     - App Check uses Play Integrity (device integrity signals, Google-processed).
     - Audio from dictation stays on the device (the on-device recognizer only).
   - **Store listing:**
     - title "Envoy: private AI agent";
     - short description (≤ 80 characters): "Ask the cloud, keep your secrets: private details become tags on your phone.";
     - full description;
     - icon 512×512 (from the new launcher mark);
     - feature graphic 1024×500;
     - at least 2 phone screenshots (the three steps);
     - category Productivity;
     - contact email;
     - privacy policy URL.
6. **Play App Signing (owner, then Claude):**
   - Enroll the app (default for new apps) and upload the AAB.
   - Copy the **app signing key** SHA-256 and SHA-1 from Play Console → App integrity.
   - Claude, via CLI after showing each command:
     - adds them to the Firebase Android app;
     - links the Cloud project in Play Console → App integrity → Play Integrity API;
     - updates the API key's Android restriction.
7. **Internal testing (contest window):** create the internal test track, add testers by email (owner and team), publish, and install from the opt-in link. Check the cloud answer works with Play Integrity, and that `inferenceSource` is ON_DEVICE on a Gemini Nano phone if one is available.
8. **Closed testing (starts the 14-day clock):**
   - Create a closed track with a Google Group of at least 12 real testers (friends, colleagues, the hackathon community).
   - Submit for review.
   - Keep all testers opted in for 14 days.
9. **Production access (owner applies after day 14):** answer the questionnaire about the closed test, then roll out to production (staged, 20% to 100%).
10. **After launch:** a Play badge on the landing page and README, and a Play link in the Devpost story.

## Risks

- **AI-content reporting:** the policy asks for in-app reporting without leaving the app. Envoy has no backend and no database, by design. The choices are an email draft (simple, but it leaves the app) or a Firebase product to receive reports (in-app, but a new data store). The owner decides.

- **The 12-tester rule** (above).
- **App Check:** Play Integrity fails until the app signing key is registered, and the app explains this in plain words (already implemented).
- **Gemini Nano:** it's only on AICore phones, so most testers see Basic protection, as the app says.
- **Policy review:** AI-content and Data safety answers must match the app's behaviour exactly.
