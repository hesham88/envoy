# Submission kit

Paste-ready fields and assets for the YouTube upload, the Chrome Web Store listing and the Devpost submission. Generated from one source, so the three stay consistent. Assets: `docs/submission/` (thumbnails, gallery) and `apps/extension/store/` (store icon, screenshots, tiles).

## Envoy YouTube upload

**v7 (26 Nov) to upload.** v6 is public at https://www.youtube.com/watch?v=yvChwFT2770 and embedded on the Envoy website until v7's link replaces it. v7 adds the sample cards, the What you see / What leaves view, offline answering and the held question, and photo masking in the extension; the guard scene is kept.

### 1. Upload the film

_studio.youtube.com → Create → Upload videos_

- Video: `F:\Projects\Envoy-wt\claude\video\out\envoy-demo-v7.mp4` (2:58, 1920×1080, 30 fps, -16 LUFS, 80 MB)
- Subtitles (optional, _Subtitles → Upload file → With timing_): `F:\Projects\Envoy-wt\claude\video\out\envoy-demo-v7.srt`

### 2. Details

_Details page_

- **Playlists:** None
- **Audience:** No, it's not made for kids

**Title** (95 / 100)

```text
Envoy: your private AI agent to the cloud | Firebase AI Logic hybrid inference | #BuildHybridAI
```

**Description** (2461 / 5000)

```text
Envoy is your private AI agent to the cloud. Ask cloud AI about a lease, an offer letter or a lab report without handing over your private details.

Chrome's built-in model (Gemma 4, the model Gemini Nano 4 is built on) runs on your device through Firebase AI Logic hybrid inference. It finds names, IDs, accounts and amounts, keeps only the parts of the document your question needs, and turns private details into tags like [LANDLORD] and [RENT]. You see exactly what the cloud will see, and nothing is sent until you approve. Gemini in the cloud reasons over tags only (Fast: Gemini 3.5 Flash-Lite, or Gemini 4 Hydrogen), and Envoy puts your real details and the worked-out amounts back on your device. Local only keeps every answer on the device. The What leaves view shows the exact text that left, beside your document. Offline, Envoy keeps answering on the device and can hold an approved cloud question until the network is back. The Chrome extension masks photos on your device before you upload them.

Watch a real Private-mode run (recorded on Gemma 4, no setup): https://envoy-hybrid-ai.web.app/app?recorded=1
Try it live: https://envoy-hybrid-ai.web.app
Code (Apache-2.0): https://github.com/hesham88/envoy

Chapters
0:00 Everything you paste leaves your device
0:19 Private details become tags; five real situations, one click
0:39 A real Private-mode session on Gemma 4 (Gemini Nano 4)
0:59 You approve what leaves; the guard blocks raw details
1:16 What you see, what leaves, and the answer
1:39 Offline: answered on the device; a cloud question held, sent once
2:01 Hybrid inference with Firebase AI Logic
2:11 The Chrome extension
2:23 Photos masked on the device
2:40 Measured results

Measured on 36 test documents with Gemma 4 on 24 Nov 2026: every planted private detail masked, 0 raw details sent after the guard, and about a quarter of the document text sent (masked); 28 of 28 guard attacks blocked. Full results: https://github.com/hesham88/envoy/blob/main/docs/EVAL.md

About this video: a real session on a CPU-only laptop, with Gemini 3.5 Flash-Lite as the cloud model. Long on-device waits are cut, and the film says where; the network is switched off with Chrome's own network emulation. Everyone in it is fictional. Narration: Chatterbox TTS (Resemble AI, MIT licence), an AI voice. Music and sound effects are original, made in code.

Made for the Firebase #BuildHybridAI 2026 hackathon.

#BuildHybridAI #FirebaseAILogic #Gemini
```

- Thumbnail (1280×720): `F:\Projects\Envoy-wt\claude\docs\submission\youtube-thumbnail.jpg` (Custom thumbnails need a phone-verified YouTube account.)

### 3. Show more

_Details page → Show more_

- **Altered content:** No. The footage is real screen recordings and the voice imitates no real person; the description says the narration is an AI voice. If you would rather be cautious, Yes is also acceptable.
- **Video language:** English
- **Category:** Science & Technology
- **License:** Standard YouTube License
- **Allow embedding:** On (the Envoy website embeds the film)
- **Comments:** On

**Tags** (184 / 500)

```text
Envoy, Firebase AI Logic, hybrid inference, Gemini Nano, Gemma 4, Chrome built-in AI, Prompt API, on-device AI, privacy, PII masking, Gemini, Chrome extension, App Check, BuildHybridAI
```

### 4. Subtitles

_Video elements → Add subtitles → Upload file → With timing_

- English subtitles (.srt): `F:\Projects\Envoy-wt\_backup-1527\envoy-demo-v6.srt` (The rules accept English or English subtitles; this adds both.)

### 5. Publish and share the link

_Visibility → Public → Publish_

- **Visibility:** Public (the contest requires a public video)

Copy the video link and send it to Claude: it goes into the Envoy website (the "See it in under three minutes" section), the README, the Devpost video field and the Chrome Web Store promo video.

## Envoy Web Store listing

Fill the tabs in this order, then Save draft and Submit for review. Review can take several days, so submit as early as you can before 30 November.

### 1. Package

_Build → Package → Upload new package_

- Store package (version 0.1.3, uploaded 26 Nov): `F:\Projects\Envoy-wt\claude\apps\extension\envoy-extension-0.1.3-store.zip` (Holds key.pem so the store keeps the extension ID ekmjefnebmjbeahkadaheapbgpgkabkd. Upload it only to the Web Store.)

### 2. Store listing: product details

_Build → Store listing_

- **Title from package:** Envoy: private AI agent to the cloud (from the manifest, nothing to type)
- **Summary from package:** Ask cloud AI about private text. Envoy masks your details on your device, and you approve exactly what is sent.
- **Category:** Privacy & Security (Productivity also fits)
- **Language:** English
- **Mature content:** Off

**Description** (2301 / 16000)

```text
Envoy lets you use cloud AI with private documents and messages while sharing as little as possible.

Before anything leaves your computer, Envoy finds your private details on your device (names, emails, phone numbers, IDs, bank and account numbers, amounts, API keys, and words you mark as private) and swaps them for tags that keep their meaning, like [LANDLORD] or [RENT]. You see exactly what would be sent, and nothing is sent until you approve. When the answer comes back, your real details are put back on your device.

WHAT YOU GET
• Side panel: the Envoy chat, with a privacy flight recorder for every answer (where each step ran, which model, how long it took) and an approval card with the exact text that would leave. Choose Local only, Fast (Gemini 3.5 Flash-Lite) or Gemini 4 Hydrogen. Select text on any page, right-click, and choose Ask Envoy about this selection.
• On sites you switch on: a small chip on text boxes. Turn it on and private details light up; Replace swaps them for tags before you press send, and Undo puts your text back.
• Upload with Envoy: beside the chip on message boxes. Envoy rebuilds a file on your device before the site gets it: it masks text documents and PDFs, strips photo location and camera data, and lets you black out parts of an image. The rebuilt file goes into the site's message box.

HOW IT WORKS
Chrome's built-in AI runs on your device through Firebase AI Logic hybrid inference. Private steps run only on the device; only the reasoning, over tags, goes to Google's Gemini in the cloud, protected by Firebase App Check. Without the on-device model, Basic protection (local rules) still masks IDs, numbers, emails and accounts, and Envoy tells you which mode ran.

PRIVACY
• Off on every site until you switch it on: Envoy asks for access to one site at a time.
• Text-box checks and file rebuilding run on your computer; the extension doesn't send your text anywhere.
• Cloud questions go through the Envoy web app in the side panel, only after you approve the exact masked text.
• Chat history is off unless you turn it on; then it is encrypted on this computer.
Privacy policy: https://envoy-hybrid-ai.web.app/privacy

Open source (Apache-2.0): https://github.com/hesham88/envoy
Envoy explains documents; it isn't legal or financial advice.
```

### 3. Store listing: graphic assets

_Build → Store listing → Graphic assets_

- Store icon (128×128): `F:\Projects\Envoy-wt\claude\apps\extension\store\store-icon-128.png`
- Screenshot 1: findings on a text box: `F:\Projects\Envoy-wt\claude\apps\extension\store\screenshot-1-text-box.png`
- Screenshot 2: replaced with tags: `F:\Projects\Envoy-wt\claude\apps\extension\store\screenshot-2-replaced.png`
- Screenshot 3: Upload with Envoy: `F:\Projects\Envoy-wt\claude\apps\extension\store\screenshot-3-upload.png`
- Screenshot 4: side panel approval: `F:\Projects\Envoy-wt\claude\apps\extension\store\screenshot-4-approval.png`
- Screenshot 5: off until you switch it on: `F:\Projects\Envoy-wt\claude\apps\extension\store\screenshot-5-popup.png`
- Small promo tile (440×280): `F:\Projects\Envoy-wt\claude\apps\extension\store\promo-tile-440x280.png`
- Marquee promo tile (1400×560, optional): `F:\Projects\Envoy-wt\claude\apps\extension\store\marquee-1400x560.png`

Screenshots are 1280×800, 24-bit PNG with no transparency, rendered from the real 0.1.2 build. Upload them in this order. Global promo video: https://www.youtube.com/watch?v=yvChwFT2770

### 4. Store listing: additional fields

_Build → Store listing → Additional fields_

- **Official URL:** Leave empty unless you verify envoy-hybrid-ai.web.app in Google Search Console (optional).

**Homepage URL** (31 / 2048)

```text
https://envoy-hybrid-ai.web.app
```

**Support URL** (40 / 2048)

```text
https://github.com/hesham88/envoy/issues
```

### 5. Privacy practices

_Build → Privacy_

- **Data usage: Website content:** Tick it. Only the text the user chooses to check, and the masked excerpt the user approves is sent to Google’s Gemini API through Firebase AI Logic to answer the question.
- **Data usage: everything else:** Leave unticked (personally identifiable, health, financial, authentication, personal communications, location, web history, user activity). Envoy masks those details before anything is sent and stores nothing on a server.
- **Certifications:** Tick all three: not sold; not used or transferred for unrelated purposes; not used for creditworthiness or lending.

**Single purpose** (132 / 1000)

```text
Helps people use cloud AI with private text by masking their private details on their device and sending only the text they approve.
```

**sidePanel justification** (44 / 1000)

```text
Shows the Envoy chat in Chrome’s side panel.
```

**contextMenus justification** (87 / 1000)

```text
Adds "Ask Envoy about this selection", which hands the selected text to the side panel.
```

**storage justification** (102 / 1000)

```text
Keeps the user’s own privacy rules and the list of sites they switched Envoy on for, on this computer.
```

**scripting justification** (95 / 1000)

```text
Adds Envoy’s text-box and upload helpers to the sites the user switches on, one site at a time.
```

**offscreen justification** (168 / 1000, updated for 0.1.3: the offscreen page also reads photos)

```text
Runs Envoy's on-device checks in an extension page instead of inside the website: the AI check for text boxes, and reading text and barcodes in photos the user uploads.
```

**activeTab justification** (140 / 1000)

```text
When the user switches Envoy on for the current site from the toolbar popup, adds the helpers to that open tab right away, without a reload.
```

**Host permission justification** (163 / 1000)

```text
Optional host access is requested only when the user switches Envoy on for a site, so the text-box and upload helpers can run there. No site is enabled by default.
```

**Remote code** (no field on the Privacy page as of 26 Nov 2026: the store checks the package itself; 0.1.2 was rejected for Firebase script URLs in the bundle, fixed in 0.1.3, `docs/SECURITY.md`). If a reviewer asks:

```text
All code ships in the package. The side panel shows Envoy’s own web app (https://envoy-hybrid-ai.web.app) in a frame so cloud requests are protected by Firebase App Check; no remote script runs in the extension.
```

**Privacy policy URL** (39 / 2048)

```text
https://envoy-hybrid-ai.web.app/privacy
```

### 6. Distribution

_Build → Distribution_

- **Payments:** Free of charge
- **Visibility:** Public (judges can find and install it). Unlisted also works if you prefer only people with the link.
- **Regions:** All regions

### 7. Test instructions for the reviewer

_Build → Test instructions_

**Test instructions** (938 / 5000)

```text
No account or login is needed. All sample details are fictional.
1. Click the Envoy toolbar icon on any website with a text box and switch on "Envoy on this site". Chrome asks for access to that one site.
2. Click in a text box: a small "Envoy off" chip appears. Click it to turn protection on, then type: Hi, I'm Mona Adel (mona.adel@example.com, +20 100 555 0192), my bank account number 1010192316. The details light up. Press Replace to swap them for tags; Undo puts the text back.
3. Click "Upload with Envoy" beside the chip, choose a .txt file or a photo (the sample photo is at https://envoy-hybrid-ai.web.app/samples/lab-bill.webp): Envoy reads the photo on the device and masks every private detail it finds, QR code included; press a mask to keep that part visible, then press Send. Envoy rebuilds the file on the device and hands it to the site.
4. Open the side panel (toolbar icon → Open Envoy panel), choose "Try the sample lease", and press Approve and send to see a cloud answer over tags.
Chrome 139 or later. Chrome's on-device AI is optional: without it Envoy uses Basic protection (local rules) and says so.
```

Then Save draft and Submit for review.

## Envoy Devpost submission

Devpost has four pages. You can edit the submission until the deadline (Mon 30 Nov, 2:00 PM PT), so submit early and refine. Upload the film to YouTube first: its link goes on page 2.

### 1. Project overview

_Page 1: General info_

**Project name** (41 / 60)

```text
Envoy: your private AI agent to the cloud
```

**Elevator pitch** (198 / 200)

```text
Ask the cloud, keep your secrets. Chrome’s on-device AI turns your private details into tags and sends only what your question needs. Gemini reasons over tags; your details come back on your device.
```

- Thumbnail (3:2, 1500×1000): `F:\Projects\Envoy-wt\claude\docs\submission\devpost-thumbnail.png`

### 2. Project story

_Page 2: About the project (Markdown)_

**About the project**

```text
## Inspiration
People paste leases, offer letters, lab results and config files full of keys into cloud AI every day, and every name, ID, account and amount goes with them. Most of the time the cloud doesn't need any of that to help. We wanted a way to get the cloud's reasoning without handing over the details.

## What it does
Envoy is your private AI agent to the cloud. You ask a question about a private document or type a message with private details. Chrome's built-in model, on your device, finds the private details, keeps only the parts of the document the question needs, and swaps names, IDs, accounts and amounts for tags that keep their meaning, like [LANDLORD] and [RENT]. You see exactly what the cloud will see and approve it. Gemini reasons over tags only and writes any maths as an expression, such as {{RENT * 1.10}}; Envoy works out the real amount and puts your details back, on your device. Questions the document answers directly are answered on the device, and 0 bytes leave.

- **Privacy flight recorder:** every step, where it ran, which model, how long it took.
- **Approval card:** the exact excerpt, editable; a guard blocks raw details even when spaced out, encoded or disguised.
- **Network ledger:** every request and what it carried.
- **Choice of cloud:** Local only, Fast (Gemini 3.5 Flash-Lite) or Gemini 4 Hydrogen, with Flash-Lite answering if Hydrogen is busy or out of quota.
- **Chrome extension:** a chip on text boxes of sites you switch on (details light up, Replace swaps them for tags) and Upload with Envoy, which rebuilds files on the device before a site gets them (masked text and PDFs, photos without location data, photos masked automatically on the device, names, IDs, account and record numbers, barcodes and QR codes, each mask switchable; PDFs come back as simplified text PDFs).
- **No model yet?** A guide checks the computer and walks through turning on private mode; Basic protection (local rules) still masks the details meanwhile, and a recorded Private-mode run shows the full experience.

## How we built it
Envoy is built on **Firebase AI Logic hybrid inference** in Chrome:
- One `GenerativeModel` per step, each with its own `InferenceMode`. Finding details, choosing clauses, routing and local answers use `ONLY_ON_DEVICE` on Chrome's built-in model (measured on Gemma 4, the model Gemini Nano 4 is built on). Only the reasoning step reaches the cloud: Gemini 3.5 Flash-Lite with `PREFER_IN_CLOUD`, or Gemini 4 Hydrogen with `ONLY_IN_CLOUD` and Flash-Lite as its fallback.
- Structured output on both sides from one JSON Schema (`responseConstraint` on the device, `responseJsonSchema` in the cloud).
- A **device guard**: because of firebase-js-sdk issue #10635 (`ONLY_ON_DEVICE` can silently use the cloud when Chrome's model is missing), every private step checks availability, sets a network tripwire on the AI Logic endpoint, and asserts `inferenceSource === ON_DEVICE`. A blocked request stops the run; it never falls back to the cloud.
- **App Check** (reCAPTCHA Enterprise, limited-use tokens) is enforced; **Remote Config** picks the cloud models; the app is on **Firebase Hosting** with CI deploys.
- React + Vite + Tailwind for the web app and a Manifest V3 extension that embeds the same chat in Chrome's side panel. A deterministic core (rules, tags, guard, restore) is shared by both.

## Measured
Measured on 36 test documents with Gemma 4 on 24 Nov 2026: every planted private detail masked, 0 raw details sent after the guard, and about a quarter of the document text sent (masked); 28 of 28 guard attacks blocked. Answer quality on 20 questions: Gemini 3.5 Flash-Lite, grading against an answer from the whole document, scored Private mode at 97.5%. Because it also wrote some of the answers, every answer was also checked by the team (our AI coding assistants and human reviewer, reading each answer against its document): Private mode 95%, Basic protection 97.5%. Every number names its model, date and sample size: [EVAL.md](https://github.com/hesham88/envoy/blob/main/docs/EVAL.md).

## Challenges we ran into
- **Trusting "on device".** The SDK bug above meant "private" steps could reach the cloud; the device guard and its tests made the boundary checkable.
- **CPU-only latency.** On our laptop's CPU the on-device steps take one to two and a half minutes. We added an in-memory cache, honest progress, a "Don't wait" option, and cut the waits in the film and said so.
- **A model that crashed.** Chrome's earlier default model ran all 36 cases on 22 November but crashed after 12 on the current pipeline the next day, so we removed its numbers rather than publish stale ones.
- **Real-world shapes.** Real use found a plain bank account number the 36 cases missed, and a site (Google's AI Mode) whose upload button only exists while its menu is open. Both are fixed and now tested.

## Accomplishments that we're proud of
0 raw details sent across 36 documents and 263 private details on our benchmark, 28 of 28 disguised leaks blocked, about a quarter of the document sent, and a privacy boundary a user can actually see: the recorder, the approval card and the ledger.

## What we learned
Small on-device models are strong at finding and trimming but weaker at arithmetic, so the cloud should do the reasoning over tags while the device does the maths with the real values. Measuring with the real pipeline, and dating every number, kept us honest.

## What's next
Faster on-device runs on GPUs, a held-out evaluation set written by someone other than the rule authors, more benchmark cases (other languages, unusual account-number formats, ambiguous references to people), Android with Gemini Nano, and more languages.

## Built during the submission period, and with what
The repository starts on 22 November 2026; no code predates it. AI tools: Claude Code (Anthropic) built the core, the AI layer, the web app, the extension and the visual identity; Antigravity (Google, Gemini) built the evaluation harness; both used the Firebase agent skills. Meta Muse Wonder (Meta) did the extension's early development; on 22 November Claude Code (Claude Opus) and Antigravity's Gemini Neon coding agent took it over. Codex Astra (OpenAI), Claude and Antigravity were also used as outside reviewers, playing the judges. The demo film's narration is Chatterbox TTS (Resemble AI, MIT licence). All art is drawn in code; libraries: Firebase JS SDK, React, Vite, Tailwind CSS, pdf.js, Lucide icons, Fraunces and IBM Plex fonts. Inspired by PAPILLON (Li et al., NAACL 2025) and designed with Google PAIR's People + AI Guidebook.
```

### 3. Built with, links and media

_Page 2: Built with, Try it out, Project media_

- **Demo video URL:** https://www.youtube.com/watch?v=yvChwFT2770

**Built with (type each, press Enter)**

```text
firebase-ai-logic, firebase, firebase-app-check, firebase-remote-config, firebase-hosting, gemini, gemini-nano, gemma, chrome-built-in-ai, prompt-api, chrome-extension, recaptcha-enterprise, react, typescript, vite, tailwindcss, pdf.js, playwright, vitest, github-actions, node.js
```

**"Try it out" link 1**

```text
https://envoy-hybrid-ai.web.app/app?recorded=1
```

**"Try it out" link 2**

```text
https://github.com/hesham88/envoy
```

**"Try it out" link 3**

```text
https://envoy-hybrid-ai.web.app
```

- Gallery 1: private details become tags: `F:\Projects\Envoy-wt\claude\docs\submission\gallery-1-tags.jpg`
- Gallery 2: privacy flight recorder: `F:\Projects\Envoy-wt\claude\docs\submission\gallery-2-recorder.jpg`
- Gallery 3: you approve what leaves: `F:\Projects\Envoy-wt\claude\docs\submission\gallery-3-approval.jpg`
- Gallery 4: the guard blocks raw details: `F:\Projects\Envoy-wt\claude\docs\submission\gallery-4-guard.jpg`
- Gallery 5: the Chrome extension: `F:\Projects\Envoy-wt\claude\docs\submission\gallery-5-extension.jpg`
- Gallery 6: Upload with Envoy: `F:\Projects\Envoy-wt\claude\docs\submission\gallery-6-upload.jpg`
- Gallery 7: measured, not promised: `F:\Projects\Envoy-wt\claude\docs\submission\gallery-7-measured.jpg`

### 4. Additional info for judges

_Page 3 (not public)_

- **Submitter type:** Individual
- **Country of residence:** Yours
- **Organization name:** Leave empty
- **Project start date:** 11-22-26
- **New or existing?:** New: the repository starts on 22 November 2026, and no code predates it.
- **Platform(s):** Web (Chrome)
- **Eligibility (three boxes):** Yours to confirm: age of majority, eligible jurisdiction, and not an employee, representative or agent of the sponsors or administrator.

**How it meets the main technology requirement**

```text
Envoy calls Firebase AI Logic (firebase/ai) at runtime with hybrid inference in Chrome. Each pipeline step is its own GenerativeModel with its own InferenceMode: finding private details, choosing clauses, routing and local answers run ONLY_ON_DEVICE on Chrome's built-in model (measured on Gemma 4, the model Gemini Nano 4 is built on); only the reasoning step goes to the cloud (Gemini 3.5 Flash-Lite with PREFER_IN_CLOUD by default, or Gemini 4 Hydrogen with ONLY_IN_CLOUD and Flash-Lite as fallback). A device guard checks availability, trips on any network call to the AI Logic endpoint during a private step, and asserts inferenceSource === ON_DEVICE (firebase-js-sdk #10635). Structured output on both sides comes from one JSON Schema. App Check (reCAPTCHA Enterprise, limited-use tokens) is enforced, Remote Config chooses the cloud models, and the app runs on Firebase Hosting. Code: packages/ai/src/firebase.ts, models.ts, pipeline.ts and device-guard.ts.
```

**Working demo URL**

```text
https://envoy-hybrid-ai.web.app
```

**Testing instructions**

```text
No login or credentials are needed. The sample lease and everyone in it are fictional.
Before you start (Chrome setup): any desktop Chrome runs this test. Without Chrome's on-device model, Envoy uses Basic protection (local rules) and says so. Private mode needs desktop Chrome with the built-in model: check chrome://on-device-internals, or follow https://github.com/hesham88/envoy/blob/main/docs/GEMMA4_SETUP.md for our exact Gemma 4 setup (Chrome 158, one developer-trial flag, about 10 minutes plus the model download). Private mode was measured on Gemma 4 (Gemini Nano 4); on Chrome's default model, results may vary. On-device steps can take about a minute on a CPU-only laptop.
1. Open https://envoy-hybrid-ai.web.app/app?sample=lease and ask: "Can my landlord raise the rent 20% this year?"
2. Watch the flight recorder: each step says where it ran (this device or the cloud), which model and how long.
3. Read "What the cloud will see": names, IDs, the IBAN and the rent are tags. Approve to get the answer, with your real numbers put back on your device. Add ?inspect=1 to the address to see the network ledger.
4. No on-device model on your computer? Open https://envoy-hybrid-ai.web.app/app?recorded=1 to watch a real, recorded Private-mode run on Gemma 4, labelled as a recording, with the real step times.
5. The Chrome extension (optional): https://github.com/hesham88/envoy/tree/main/apps/extension.
```

**Open-source license URL**

```text
https://github.com/hesham88/envoy/blob/main/LICENSE
```

### 5. Submit

_Page 4_

- **Terms:** Tick "I, and all of my team members, have read and agree…" after reading the Official Rules.
- **Deadline:** Mon 30 Nov 2026, 2:00 PM PT (midnight Tue 1 Dec in Cairo). Commits after the deadline are not judged.

The disclosure above names every AI tool that built part of Envoy: Claude Code, Antigravity (Gemini Argon and Neon agents) and Meta Muse Wonder.
