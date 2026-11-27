# Demo film v9 and the Android rework: design

27 November 2026. Owner-approved storyboard; this document fixes the details before building.

## Why

Envoy has to win #BuildHybridAI on three criteria the owner quoted:

- **Design:** "a complete, coherent product experience, not just a technical proof of concept."
- **Potential impact:** "a credible, specific case for solving a real problem for a real audience, … based on what's demonstrated."
- **Quality of the idea:** "creative, non-obvious use of Firebase AI Logic and genuine understanding of the problem space."

The owner reviewed the v8 cut (2:54) and found six problems:
- the opening looked broken (my 1.25× crop sliced through the app);
- the wait notes carried durations;
- the offline scene's narration ran ahead of the picture;
- the CLI receipt felt out of place;
- the Android scene looked poor;
- the story read as a feature list.

v8 is superseded and must not be uploaded.

## Goals

- **A story, not a tour:** one protagonist (Mona, the tenant in every sample), one pain, and the same promise kept on every surface: web, Chrome extension, Android.
- **Sync:** every narration line lands on the moment it describes, and no cut or effect breaks a word or an action.
- **Android as a product:** a reworked UI that films clearly and is good to use.
- **Under 3:00,** aiming for 2:50–2:58.

## Non-goals and anti-goals

- **Non-goals:** no new engine features, and no Hydrogen takes.
- **Anti-goals:**
  - a terminal or code editor on screen (research and owner agree);
  - claims the footage doesn't show (the emulator runs Basic protection, so its scene says so);
  - naming or showing third-party products;
  - crops that cut the app's edges;
  - durations in the wait notes.

## Research (inline, 27 Nov)

Winning demo films make the viewer feel the problem before the product, then go problem → solution → walkthrough → impact → call to action. They keep two or three core features tied to one pain, put a person at the center with the product as their tool, and never show a terminal. Sources: AngelHack demo tips, the AI Tinkerers video guide, reskilll's 3-minute pitch guide, HubSpot and Storylane on product demo films.

## Approaches considered

**Film:**
- **A. Re-cut v7/v8 footage, adding new scenes (chosen).** The private take is real and already reviewed; re-shooting it costs a long CPU run and risks quota.
- **B. Re-film the whole web session.** Rejected: hours of CPU and a Hydrogen risk, for footage that already works.

**Narration sync:**
- **A. One line per scene with an offset.** Rejected: it can't land on two events in one scene.
- **B. Short sub-lines, each placed at a time in the scene (chosen).** Times come from the take's marks and Whisper word timestamps.

**Android UI** (owner picked):
- **A. Three-step flow: Document → What leaves → Answer (chosen).**
- B. One polished scrolling screen.
- C. Chat style.

## The film (v9)

| # | Beat | ~Time | Picture | Narration (draft; final wording is the builder's) |
| --- | --- | --- | --- | --- |
| 1 | Intro | 0:00–0:08 | v7 title card (`n01-open`) | "This is Envoy, your private AI agent to the cloud." (reuse) |
| 2 | Awareness | 0:08–0:22 | v7 `n02-problem` (a document pasted into a generic chat; it all leaves) | The problem, in human terms (reuse v7's line) |
| 3 | The promise | 0:22–0:40 | Uncropped: the lease cut to one clause; `{{RENT * 1.10}}` worked out to EGP 9,350; Mona's badge with face, ID and QR boxed | "Envoy changes the deal…": tags, maths on the device, photos boxed |
| 4 | Easy: Mona's question | 0:40–1:25 | The private take, in order: ask (n06), the recorder (n07), approve exactly what leaves (n08), the answer restored (n10), What leaves beside her document (n09) | Short lines on each moment; the order fix puts approve before the answer and What leaves last |
| 5 | The edge | 1:25–1:52 | The guard blocks a pasted IBAN (n08g); with the network off, answered on the device (n11, the question typed on screen); Save signed receipt in the app | "With the network off…" over the typing; the receipt shown in the app only (verification lives in the README) |
| 6 | Everywhere Mona works | 1:52–2:30 | Extension: her paste on a chat page held, Replace → tags; her staff badge photo boxed; the Android app's three steps | "Same promise, wherever she works": web, extension, phone. Android says Basic protection on screen |
| 7 | Firebase, on purpose | 2:30–2:42 | The live stack, filmed in the model Chrome ("On-device model: available") | AI Logic per-step modes and the guard, App Check, Remote Config, Hosting |
| 8 | Proof and the call to action | 2:42–2:58 | The measured table, then the end card with the URL | 263/263 masked, 0 leaked; 282/282 attacks blocked; about 11 s on a GPU. "Live now, no sign-in." |

**Mechanics:**
- Narration lines become `{ id, parts: [{ text, at }] }`. Each part is its own voice file, placed at `scene start + at`.
- A scene lasts until its last part ends plus the tail, or the clip end for `full` scenes.
- New lines are rendered with Chatterbox in the v7 voice; reused lines keep their wav files.
- The wait notes show "Wait cut" only.
- No crops; push-ins stay gentle.

## Android rework (three steps)

- **Top bar:** the Envoy mark, plus a status pill (Private in green with Gemini Nano, Basic in amber with local rules).
- **Step indicator:** ① Document ② What leaves ③ Answer. The current step is highlighted; you can go back.
- **Step 1, Document:**
  - sample chips (Lease, Offer, Lab, Photo);
  - a document preview card with the title;
  - the question field with dictation;
  - a sticky button: "Check what leaves →".
- **Step 2, What leaves:**
  - the header "N private details → tags · X of Y characters (Z%)";
  - the detected details as chips (type → tag);
  - the excerpt, with tags rendered as coloured inline chips (an AnnotatedString);
  - a Basic-protection note when it applies;
  - a sticky button: "Approve and send".
- **Step 3, Answer:**
  - the restored answer, with real values in green;
  - badges: "Reasoned in the cloud over tags" and "Restored on this phone";
  - read aloud;
  - the flight recorder as a vertical timeline with where-ran chips (This phone in green, Cloud in blue) and milliseconds;
  - a sticky button: "Ask another question".
- **Look and accessibility:** the UV-night palette from the web, dark only, headings and content descriptions kept, and touch targets of at least 48 dp.
- **Scope:** UI files only (`ui/EnvoyScreen.kt`, a new `ui/Theme.kt` and step composables). `core/` and `ai/` are unchanged, so parity tests, CI and the device guard stay green. AGP 8.13 and Compose BOM 2025.10 stay. The ViewModel gains only a `step` field.
- **Film:**
  - recorded with marks (sample, excerpt, approve, answer);
  - framed at about 1,000 px tall inside a drawn device bezel, or as two phones side by side (What leaves and Answer);
  - the caption states Basic protection on the emulator.

## Constraints

- The deadline is Mon 30 Nov, 2 PM PT, and Sunday is the freeze for the video and Devpost.
- This machine has 16 GB of RAM: only one of the emulator, the model Chrome or Chatterbox runs at a time.
- The emulator's App Check debug token stays until the Android footage is approved, then it's revoked.
- `npm run verify` and the Android CI job must pass before every merge.

## Left to the builder

- final narration wording within each beat;
- exact transitions;
- the device-bezel styling;
- chip colours per tag type;
- whether step 2 shows the detected-details list collapsed.
- **Optional:** a 3–4 s shot in beat 6 of a Word file dropped into the web app and masked on the device (the storyboard names Word, Excel and PowerPoint). Kept only if the cut stays under 3:00.
