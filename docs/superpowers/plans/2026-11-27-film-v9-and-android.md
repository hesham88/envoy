# Film v9 and the Android rework: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native; CLAUDE.md: no subagent swarms). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A three-step Android app that films well, and a 2:50–2:58 demo film that follows Mona across web, extension and Android, with every narration line on its moment.

**Architecture:**
- **Android:** UI-only rework. Pure helpers (stage, summary, tag ranges) sit in `ui/Steps.kt`, with JVM unit tests. The composables live in `ui/EnvoyScreen.kt` and `ui/Theme.kt`.
- **Film:** the existing pipeline (`video/record-*.mjs` → `film/overlays.mjs` → `film/build.mjs`) gains narration *parts*, each voice placed at its own time in a scene, and a `--v9` cut.

**Tech stack:** Kotlin, Jetpack Compose (BOM 2025.10.01), AGP 8.13.2; Node scripts with Playwright and ffmpeg 9; Chatterbox TTS; faster-whisper.

**Spec:** `docs/superpowers/specs/2026-11-27-film-v9-and-android-design.md`

## Global Constraints

- **Android scope:** `core/` and `ai/` are unchanged, and parity tests and the device guard stay green. The ViewModel gains only what the stage needs.
- **Toolchain:** AGP 8.13.2, Compose BOM 2025.10.01, compileSdk 36, minSdk 26.
- **Film length:** ≤ 3:00 (target 2:50–2:58), 1920×1080, 30 fps, about −16 LUFS.
- **What the film shows:**
  - no terminal or code editor;
  - no third-party products;
  - no crops that cut the app's edges;
  - wait notes that say only "Wait cut".
- **Honesty:** the Android footage is the emulator in Basic protection, and the picture says so.
- **Memory:** one of the emulator, the model Chrome or Chatterbox at a time (16 GB).
- **Gates:** `npm run verify` before every commit; Android `testDebugUnitTest assembleDebug` before every Android commit; merges only after CI passes; `allow-preview.mjs` for each PR.

## Review Focus

1. **Long documents:** a long excerpt in step 2 must scroll inside the card, with the sticky button always visible. Pinned by Task 2's screenshot check on the lease sample (2,564 characters).
2. **Errors:** an error such as App Check refused shows on step 2 in plain words, the button stays usable, and nothing is sent. Pinned by a Task 1 test of `stageOf` with an error, which stays on LEAVES.
3. **Going back:** step 1 after an answer clears the review and the answer, so a new question can't reuse a stale excerpt. Pinned by a Task 1 test.
4. **A narration part longer than its scene:** the scene stretches and never cuts a word. Pinned by Task 4's duration rule.
5. **Tag patterns:** tags with an index (`[PERSON_2]`) and the user's own labels (`[PROJECT]`) both render as chips. Pinned by a Task 1 test.

---

### Task 1: Android stage and display helpers (pure, tested)

**Files:**
- Create: `android/app/src/main/java/app/envoy/hybrid/ui/Steps.kt`
- Modify: `android/app/src/main/java/app/envoy/hybrid/ui/EnvoyViewModel.kt` (a `startOver()` that clears the review, answer, error and steps)
- Test: `android/app/src/test/java/app/envoy/hybrid/ui/StepsTest.kt`

**Interfaces:**
- **Produces:**
  - `enum class Stage { DOCUMENT, LEAVES, ANSWER }`
  - `fun stageOf(s: UiState): Stage`: ANSWER if `answer != null`; LEAVES if `review != null`; otherwise DOCUMENT.
  - `fun leavesSummary(r: Review): String` produces `"20 private details → tags · 2,437 of 2,564 characters (95%)"`. The excerpt length is `r.excerpt.length`, with a thousands separator and a rounded percentage.
  - `fun tagRanges(text: String): List<Pair<IntRange, String>>` matches `\[[A-Z][A-Z0-9_]*\]`. Each pair is a range and the tag's base label (its `_N` suffix stripped).
  - `EnvoyViewModel.startOver()`.

- [ ] Write the tests:
  - `stageOf` covers all three states, and a state with an error and a review stays LEAVES.
  - `leavesSummary` gives the exact string above for a review with 20 entities, a 2,437-character excerpt and 2,564 document characters.
  - `tagRanges("[PERSON] pays [AMOUNT_2] to [PROJECT].")` gives three ranges with labels `PERSON`, `AMOUNT`, `PROJECT`.
- [ ] Run `gradlew testDebugUnitTest`: FAIL (unresolved).
- [ ] Implement them in `Steps.kt`, and add `startOver()`.
- [ ] Run `gradlew testDebugUnitTest`: PASS, parity tests included.
- [ ] Commit `feat(android): [V9-T1] stage and display helpers`.

### Task 2: Android three-step UI

**Files:**
- Create: `android/app/src/main/java/app/envoy/hybrid/ui/Theme.kt` (the `Uv` palette and `EnvoyTheme`, moved out of EnvoyScreen)
- Rewrite: `android/app/src/main/java/app/envoy/hybrid/ui/EnvoyScreen.kt`

**Interfaces:**
- **Consumes:** Task 1's `Stage`, `stageOf`, `leavesSummary`, `tagRanges` and `startOver`, plus the existing `vm.loadSample`, `checkWhatLeaves`, `approve`, `setQuestion`, `downloadModel`, Voice and PhotoReader hooks.
- **Produces:** the screen text the recording script targets: `"Check what leaves"`, `"Approve and send"`, `"Ask another question"`, the step labels `"Document"`, `"What leaves"`, `"Answer"`, and the pills `"Private"` / `"Basic"`.

What the screen contains:
- **Scaffold:** a top bar (the Envoy mark, plus the status pill: green "Private" with Gemini Nano available, amber "Basic" otherwise), a step indicator row, and a sticky bottom action bar.
- **DOCUMENT:**
  - sample chips in a horizontal row (with Photo), and a document preview card;
  - the question field, with dictation when it's available;
  - the bar button "Check what leaves →".
- **LEAVES:**
  - the `leavesSummary` line;
  - entity chips (type → tag);
  - the excerpt as an AnnotatedString, with tag spans as chip-styled spans (background tint per type family: person/blue, money/green, id/amber, other/muted);
  - the Basic note;
  - the error line;
  - the bar button "Approve and send".
- **ANSWER:**
  - the restored answer, with real values in green and bold;
  - the badges "Reasoned in the cloud over tags" and "Restored on this phone";
  - read aloud;
  - the flight recorder as a timeline (a dot and a line, the step name, a where-chip, ms);
  - the bar button "Ask another question" (`startOver`).
- **Accessibility:** heading semantics on step titles, 48 dp targets, and content descriptions on icon-only controls.

- [ ] Implement.
- [ ] Run `gradlew testDebugUnitTest assembleDebug`: BUILD SUCCESSFUL.
- [ ] Install on the emulator and screenshot each stage with the lease sample. Expect: the button is visible without scrolling on every stage; tags render as chips; the answer shows green values; the excerpt scrolls inside its card.
- [ ] Commit `feat(android): [V9-T2] three-step UI`, then open a PR and merge once the android CI job passes.

### Task 3: Android footage

**Files:**
- Modify: `video/record-android.mjs` (marks `sample`, `leaves`, `approve`, `answer`; no scroll hunting, because the bar button is always on screen)
- Create: `video/film/phone.mjs` (composes `raw/n16-android-phone.mp4` into `raw/n16-android.mp4`)

**Interfaces:**
- **Produces:** `raw/n16-android.mp4` (1600×900) and `raw/n16-android.marks.json`, with times on the composed clip's clock.

The composition:
- the phone screen at about 860 px tall, inside a rounded bezel (an HTML-rendered PNG with a transparent screen hole), on the left third;
- on the right, a text panel ("Envoy for Android · Basic protection on this emulator (no Gemini Nano) · firebase-ai + firebase-ai-ondevice");
- cut down to about 14 s, with the wait before Approve trimmed and the real cloud latency kept.

- [ ] Record (emulator up, model Chrome closed). Expect four marks, in order.
- [ ] Compose. Check: a frame at each mark shows that stage; no edge is cut.
- [ ] Close the emulator. Commit `feat(video): [V9-T3] Android footage`.

### Task 4: Narration parts in the builder

**Files:**
- Modify: `video/film/build.mjs`, `video/film/layout.mjs` (v9 scenes)
- Create: `video/narration-v9.json`

**Interfaces:**
- **Produces** the narration format `[{ id, parts: [{ key, text, at }], direction? }]`.
  - `at` is in seconds within the scene; the first part defaults to 0.45.
  - Voice files are `wav9/<id>.<key>.wav`. A line can reuse an older file with `{ key, text, at, reuse: 'wav7/<file>.wav' }`.
  - Scene duration is `max(3, lastPart.at + lastPart.speech + 0.65, full ? clipLen : min(clipLen, that + 1.2))`.
  - The SRT gets one cue per part.
- **Consumes:** the `--v9` flag (`scenes-v9`, `out/envoy-demo-v9.mp4`).

- [ ] Implement `--v9` and parts. Keep `--v7` and `--v8` working: a line without `parts` is one part at 0.45.
- [ ] Run `node video/film/build.mjs --v8 --draft`. Expect the same scene table as before (174.4 s).
- [ ] Commit `feat(video): [V9-T4] narration parts placed on their moments`.

### Task 5: The remaining web footage, and the v9 script

**Files:**
- Modify: `video/record-v8.mjs` (receipt scene: stop at "Receipt saved", no terminal page)
- Write: `video/narration-v9.json` (the spec's eight beats; `at` values from the take's marks and Whisper word times)
- Modify: `video/film/layout.mjs` (v9 scene entries; the promise beats uncropped)

- [ ] Re-record `n16r-receipt` in the app only. Optionally record the Word-file shot (`n15w-office`): the live app, a .docx dropped in, the masked text shown.
- [ ] Write the v9 script and run Chatterbox on the new parts. `check_lines.py` must show OK for every part (number spellings excepted).
- [ ] Commit `feat(video): [V9-T5] v9 script and footage`.

### Task 6: Draft, sync check, owner review, final

- [ ] Run `node video/film/overlays.mjs && node video/film/build.mjs --v9 --draft`. Expect a total of 170–178 s.
- [ ] Sync sheet: one frame at each part's start, with its text beside it. Every frame must show what its words say.
- [ ] Whisper on the draft mix: the words match the script apart from number spellings; no word is clipped.
- [ ] Show the owner the draft (path plus the sync sheet). Apply their notes.
- [ ] Final render, then regenerate the kit's YouTube chapters (each ≥ 10 s) and paths; update PLAN.
- [ ] Replace the release APK with the CI build of Task 2. Commit, PR, merge.
