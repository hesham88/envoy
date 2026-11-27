# YouTube upload: Envoy demo film v9

Paste-ready details for the v9 upload (27 Nov 2026). The same text lives in [SUBMISSION_KIT.md](../SUBMISSION_KIT.md).

**Done: v9 is public at https://www.youtube.com/watch?v=n7IuGRGjLbU** (27 Nov, 2:57). It replaces v7 (ZO1DbGUI4Mk, 26 Nov); v8 was never published. The website embeds v9, and the README and Devpost link to it.

### 1. Upload the film

_studio.youtube.com → Create → Upload videos_

- Video: `F:\Projects\Envoy-wt\claude\video\out\envoy-demo-v9.mp4` (2:57, 1920×1080, 30 fps, -16 LUFS, 107 MB)
- Subtitles (optional, _Subtitles → Upload file → With timing_): `F:\Projects\Envoy-wt\claude\video\out\envoy-demo-v9.srt`

### 2. Details

_Details page_

- **Playlists:** None
- **Audience:** No, it's not made for kids

**Title** (95 / 100)

```text
Envoy: your private AI agent to the cloud | Firebase AI Logic hybrid inference | #BuildHybridAI
```

**Description**

```text
Envoy is your private AI agent to the cloud. Ask cloud AI about a lease, an offer letter or a lab report without handing over your private details.

Chrome's built-in model (Gemma 4, the model Gemini Nano 4 is built on) runs on your device through Firebase AI Logic hybrid inference. It finds names, IDs, accounts and amounts, keeps only the parts of the document your question needs, and turns private details into tags like [LANDLORD] and [RENT]. You see exactly what the cloud will see, and nothing is sent until you approve. Gemini in the cloud reasons over tags only, and Envoy puts your real details and the worked-out amounts back on your device. Every answer can come with a receipt signed in your browser.

The Chrome extension flags a paste with private details on the AI chat sites you choose, holds the send once, and swaps the details for tags; it masks photos (faces, IDs, QR codes) on your device before you upload them. The Android companion app runs the same engine in Kotlin with Firebase AI Logic.

Try it live, no sign-in: https://envoy-hybrid-ai.web.app
Watch a real Private-mode run (recorded on Gemma 4, no setup): https://envoy-hybrid-ai.web.app/app?recorded=1
Chrome extension: https://chrome.google.com/webstore/detail/ekmjefnebmjbeahkadaheapbgpgkabkd
Newest extension build and the Android app: https://github.com/hesham88/envoy/releases/tag/v0.2.0-android-extension
Code (Apache-2.0): https://github.com/hesham88/envoy

Chapters
0:00 Everything you paste into cloud AI leaves your device
0:20 Envoy: one clause leaves, the maths stays on your laptop, photos boxed
0:38 A real Private-mode session on Gemma 4 (Gemini Nano 4)
1:16 The guard, offline answers and a signed receipt
1:44 The Chrome extension holds a risky paste
1:57 Faces and IDs boxed in a photo, on the device
2:07 Envoy for Android
2:22 Built on Firebase, on purpose
2:37 Measured results

Measured on 36 test documents with Gemma 4 on 24 Nov 2026: every planted private detail masked, 0 raw details sent after the guard, and under a quarter of the document text sent (masked). A generated suite of 352 cases (27 Nov): 282 of 282 disguised leaks blocked, 0 of 70 harmless texts blocked. On a cloud NVIDIA L4 GPU: a median of 10.6 s per question, against 125 s on our 2018 laptop's CPU. Full results: https://github.com/hesham88/envoy/blob/main/docs/EVAL.md and https://github.com/hesham88/envoy/blob/main/docs/benchmarks/README.md

About this video: the web session is real, on a CPU-only laptop, with Gemini 3.5 Flash-Lite as the cloud model; long on-device waits are cut, and the film says where. The extension runs on a neutral stand-in chat page, and the Android app on the Android emulator. Everyone in it is fictional; the badge portrait is AI-generated. Narration: Chatterbox TTS (Resemble AI, MIT licence), an AI voice. Music and sound effects are original, made in code.

Made for the Firebase #BuildHybridAI 2026 hackathon.

#BuildHybridAI #FirebaseAILogic #Gemini
```

- Thumbnail (1280×720): `F:\Projects\Envoy-wt\claude\docs\submission\youtube-thumbnail.jpg` (Custom thumbnails need a phone-verified YouTube account.)

### 3. Show more

_Details page → Show more_

- **Altered content:** Yes. The footage is real screen recordings, but the sample staff badge shows a realistic portrait of a fictional person made with AI (Meta Muse Image), and the narration is an AI voice (Chatterbox TTS) that imitates no real person. Disclosing it costs nothing, and the description says both.
- **Video language:** English
- **Category:** Science & Technology
- **License:** Standard YouTube License
- **Allow embedding:** On (the Envoy website embeds the film)
- **Comments:** On

**Tags**

```text
Envoy, Firebase AI Logic, hybrid inference, Gemini Nano, Gemma 4, Chrome built-in AI, Prompt API, on-device AI, privacy, PII masking, Gemini, Chrome extension, Android, App Check, Remote Config, BuildHybridAI
```

### 4. Subtitles

_Video elements → Add subtitles → Upload file → With timing_

- English subtitles (.srt): `F:\Projects\Envoy-wt\claude\video\out\envoy-demo-v9.srt` (The rules accept English or English subtitles; this adds both.)

### 5. Publish and share the link

_Visibility → Public → Publish_

- **Visibility:** Public (the contest requires a public video)

Copy the video link and send it to Claude: it goes into the Envoy website (the "See it in under three minutes" section), the README, the Devpost video field and the Chrome Web Store promo video.
