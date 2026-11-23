# Envoy for Chrome

Envoy in your browser, in three places:

- **The side panel** is the same chat as the [web app](https://envoy-hybrid-ai.web.app/app), with the privacy flight recorder, the approval card, Local only, your own rules and the network ledger. Select text on any page, right-click and choose **Ask Envoy about this selection**, and it arrives as the document.
- **Any text box** on a site you turn Envoy on for gets a small seal chip. Turn it on and a fluorescent ring locks around the field: amber while private details are still in it, green once they're replaced. A card lists what was found, lets you keep or hide each value, shows what the site receives now and after, and replaces the text in the field when you press **Replace**. Turn it off and nothing is drawn at all.
- **Upload with Envoy** appears next to file inputs on those sites. Envoy masks the text of a document, or strips location data and burns your redaction boxes into an image, then hands the site the rebuilt file.

The extension shares its code with the web app: `@envoy/core` (detection, tags, guard), `@envoy/ai` (Firebase AI Logic and the device guard), `@envoy/ui` (design system) and `@envoy/app` (the chat).

## Install (load unpacked)

```sh
npm install
npm run build -w @envoy/extension        # release build -> apps/extension/dist
npm run check:dist -w @envoy/extension   # fails if any App Check token material reached dist/
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked** and select `apps/extension/dist`.
3. Pin Envoy. Click it to open the popup, switch **Envoy on this site** on, and accept Chrome's permission prompt.

## What it can access, and why

| Permission | Why |
| --- | --- |
| `sidePanel` | The Envoy chat. |
| `contextMenus` | "Ask Envoy about this selection". The selected text goes to the side panel through `chrome.storage.session` and is removed once read. |
| `storage` | Your own rules and the sites you turned on, kept in `chrome.storage.local` on this computer. |
| `scripting` + optional host access | The text-box chip and upload button run **only on sites you switch on**, one origin at a time, after Chrome asks you. No site is enabled by default. |
| `offscreen` | Runs the on-device model check for text boxes in an extension page, never in the website's own context. |

Envoy never touches password, one-time-code, card or bank-account fields, and it writes page text only with `textContent`, never as HTML. There is no telemetry.

## On the device, and in the cloud

- Private steps (find details, choose what the question needs, decide where to answer) use Firebase AI Logic with `ONLY_ON_DEVICE` and the same device guard as the web app: they run on Chrome's built-in model or not at all.
- Without the on-device model, Envoy uses **Basic protection**: local rules for IDs, numbers, emails, accounts, keys and your own words, plus a name check. The app says which mode ran.
- **Cloud reasoning:** Firebase App Check can't attest a `chrome-extension://` page, so the side panel embeds the real Envoy web chat (`https://envoy-hybrid-ai.web.app/app?embed=extension`). It runs on the web origin, where App Check (reCAPTCHA Enterprise) works, and the frame gets Chrome's on-device model through `allow="language-model"`. Everyone gets cloud answers, and no key or debug token ships in the extension. Selected text and your rules pass to the frame by `postMessage` on this computer; the site's CSP lets only Envoy's own extension (ID `ekmjefnebmjbeahkadaheapbgpgkabkd`, fixed by the manifest key) embed it. Offline, the panel falls back to the on-device chat and offers **Continue in Envoy on the web** for cloud questions. Developer builds (`npm run build:dev`) run the chat in the panel and use a local App Check debug token. **Never share, zip or commit `dist-dev/`.**

## Requirements

Desktop Chrome with the built-in model for Private mode; `chrome://on-device-internals` shows its status, and Envoy offers the download from a click. Everything else, including Basic protection, works without it.

## Limits

- Image uploads: Envoy doesn't detect private regions in images; you draw the boxes. PDFs are rebuilt as simple text PDFs ("layout simplified"), because a box drawn over PDF text doesn't remove the text underneath.
- Rich editors receive replaced text through the same input events typing produces. The end-to-end suite checks that it reaches the editor's own document in ProseMirror and Quill, not just the screen. A site that blocks those events may need you to paste the masked text yourself.
