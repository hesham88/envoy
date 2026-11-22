# #BuildHybridAI 2026 — rules and compliance (source of truth)

Read this before any work on Envoy. Summarized from the official rules at
https://firebasehybridaihackathon.devpost.com/rules (read 2026-11-22). The full
text we read is saved at `research_notes/Gemini Nano via Firebase AI Logic/devpost_rules_raw.txt`.
If anything here conflicts with the official page, the official page wins.

## Dates (all from the rules)

| What | When (Pacific Time) | Cairo time |
| --- | --- | --- |
| Submission period | Nov 11, 1:30 PM → **Nov 30, 2:00 PM PT** | closes **00:00 Tue 1 Dec** |
| Our own target | — | **Mon 30 Nov, 6:00 PM** |
| Quota form, final sprint | request by Wed Nov 25, 10:00 AM PT | account arrives Fri Nov 27 |
| Judging | Dec 10 – Dec 16 | |
| Winners announced | around Dec 21, 12:00 PM PT | |

Commits pushed **after** the deadline are not evaluated. The repo, video and hosted app must be final by then.

## Eligibility — check before submitting

- Over the age of majority; not a resident of Brazil, Italy, Quebec, Crimea, Cuba, Iran, Syria, North Korea, Sudan, Belarus or Russia (Egypt is not excluded).
- **Ineligible:** employees, interns and **contractors** of Google, Devpost, or any organization involved in the contest, and their parent companies, subsidiaries and affiliates (and immediate family / household).
- Entering for an employer: you warrant the employer consents and that it doesn't break their policies or **work-for-hire** terms.
- **Resolved 2026-11-22:** Hesham confirmed his other work is unrelated to Google. Still build only on personal accounts and personal time (GitHub `hesham88`, Google `hesham1988@gmail.com`).

## What must be built

- A gen AI app using **Firebase AI Logic**, plus supported Firebase products, such as App Check, Remote Config, Firestore and Authentication.
- At least one platform. **A multi-platform solution is preferred.**
  - **Web (Chrome):** Gemini Nano 4 via Firebase AI Logic. A web app **or** a Chrome extension. Both count as the **same** Web/Chrome platform.
  - **Android:** Gemini Nano 4 via Firebase AI Logic. A second platform; this is what "multi-platform" means.
  - **iOS:** Apple Foundation Models via Firebase AI Logic.
- **App Check is required** (debug tokens are accepted in submissions).
- Must run consistently on its platform and work **as shown in the video and described in the text**. Don't demo anything that isn't real.
- English support is required. All materials in English.

## Submission checklist (required)

1. Select at least one platform on the form. Categories: Best Web/Chrome, Best Android, Best iOS.
2. Text description: **how we used Firebase AI Logic**, features and functionality, and the value proposition.
3. **Summary of what we built during the submission period**, plus a **disclosure of any pre-existing code or work**. AI coding assistants, frameworks and templates are allowed. Name what we used: Claude Code, Antigravity, Firebase agent skills, and any generated assets.
4. Public **GitHub** repo with all source, assets and setup instructions. It must show Firebase AI Logic **imported and actually called at runtime**, not just named in the README.
5. An **open-source license file** detectable in the repo's About section. Apache-2.0 is preferred.
6. **YouTube** video, public, **3:00 or less** (only the first 3 minutes are judged). It shows the app running on its platform, in English or with English subtitles.
7. Strongly encouraged: a **hosted URL** for judges, plus use of Google IDEs and coding agents with Firebase agent skills.

## Never include (disqualification risks)

- Production API keys, live Google Cloud secrets, confidential data, or **any real PII** in the repo, the submission form or the testing instructions. All sample people, IDs, phones and IBANs must be **fictional**.
- Third-party logos, trademarks or advertising, or anything implying a third party's endorsement. Use no other company's branding in UI, assets or video, and no brands in generated images.
- Content that violates privacy, publicity or IP rights, or anything offensive.
- Third-party SDKs, APIs or data we aren't licensed to use. Check terms for every generated asset, every TTS voice (Chatterbox) and every font.

## Judging

- **Stage 1, pass/fail:** every requirement above is met.
- **Stage 2:** four **equally weighted** criteria, each scored 1–5 and averaged.
  1. **Technological Implementation:** how well it's built and how effectively it uses **Firebase AI Logic hybrid inference**. First tie-breaker.
  2. **Design:** a complete, coherent product experience, not a proof of concept.
  3. **Potential Impact:** a credible, specific real problem for a real audience, shown in the demo.
  4. **Quality of the Idea:** a creative, non-obvious use of Firebase AI Logic, with real understanding of the problem.
- Judging may include AI-driven analysis. Make the repo, README and description easy to verify.
- The top score per category wins that category. The top score overall wins the Grand Prize. One project can win the **Grand Prize plus at most one "Best of" prize**.

## Prizes ($30,000)

Grand $10,000 (plus interview, blog post, social). 1st runner-up $7,000. 2nd runner-up $4,000. Best iOS, Best Android and Best Web/Chrome $3,000 each.

## Licence we grant Google

We keep ownership. Google gets a perpetual, royalty-free licence to evaluate and promote the project (screenshots, clips). Keep everything in the repo publishable.

## What this means for Envoy's strategy

- Web app first (Best Web/Chrome), then a **Chrome extension** as stretch. The extension strengthens the Web/Chrome entry but is **not** a second platform.
- **Android** (Gemini Nano 4 via Firebase AI Logic) is the only realistic way to "multi-platform" for the Grand Prize. It's a stretch after the web app is polished.
- Use more than AI Logic: App Check (required) plus **Remote Config** for prompts and model names. Add Firestore or Auth only if they serve the product. Never store document content.
