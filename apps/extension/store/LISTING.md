# Chrome Web Store listing (ready to paste)

## Before you submit (owner)

1. **Developer account:** register at https://chrome.google.com/webstore/devconsole with the project Google account (one-time registration fee, paid by you).
2. **Build the upload:** from the repo root:
   ```sh
   ENVOY_EXTENSION_KEY="$HOME/.envoy/extension-key.pem" npm run pack:store -w @envoy/extension
   ```
   This makes `apps/extension/envoy-extension-<version>-store.zip`. It removes `key` from the manifest (the store rejects it on a new item) and adds `key.pem`, so the store keeps the extension ID `ekmjefnebmjbeahkadaheapbgpgkabkd`, which the website allows to embed the chat. Upload this zip only to the Web Store; never share it elsewhere, because it contains the private key. If you upload without the key, the store assigns a new ID: send it to Claude, who adds it to the site's `frame-ancestors`.
3. **Review time:** Google reviews new items; it can take several days. Submit as early as possible before 30 November.

## Store listing

- **Name:** Envoy: private AI agent to the cloud
- **Summary (132 characters max):** Ask cloud AI about private text. Envoy masks your details on your device, and you approve exactly what's sent.
- **Category:** Productivity (or Privacy & Security)
- **Language:** English
- **Description:**

  Envoy lets you use cloud AI with private documents and messages while sharing as little as possible.

  Before anything leaves your computer, Envoy finds your private details on your device (names, emails, phone numbers, IDs, bank accounts, amounts, API keys and the words you mark as private) and replaces them with tags that keep their meaning, like [LANDLORD] or [RENT]. You see exactly what would be sent, and nothing is sent until you approve. When the answer comes back, your real details are put back on your device.

  In the side panel: the Envoy chat, with a privacy flight recorder for every answer (where each step ran, which model, how long it took) and an approval card with the exact text. Select text on any page, right-click, and choose Ask Envoy about this selection.

  On sites you choose: a small seal on text boxes. Turn it on and private details light up; replace them with tags in one click before you press send. "Upload with Envoy" masks documents and strips photo location data before a site receives them.

  Envoy uses Chrome's built-in AI on your device through Firebase AI Logic, and Google's Gemini in the cloud only for the reasoning, over tags. Without the on-device model it uses local rules (Basic protection) and says so.

  Open source (Apache-2.0): https://github.com/hesham88/envoy

- **Privacy policy URL:** https://envoy-hybrid-ai.web.app/privacy
- **Homepage URL:** https://envoy-hybrid-ai.web.app
- **Support URL:** https://github.com/hesham88/envoy/issues
- **Screenshots:** `store/screenshot-1-text-box.png` … `screenshot-5-popup.png` (1280×800)
- **Small promo tile:** `store/promo-tile-440x280.png`; **Marquee:** `store/marquee-1400x560.png`

## Privacy practices tab

- **Single purpose:** Helps people use cloud AI with private text by masking their private details on their device and sending only the text they approve.
- **Permission justifications:**
  - `sidePanel`: shows the Envoy chat in Chrome's side panel.
  - `contextMenus`: adds "Ask Envoy about this selection", which hands the selected text to the side panel.
  - `storage`: keeps the user's own privacy rules and the list of sites they switched Envoy on for, on this computer.
  - `scripting`: adds Envoy's text-box and upload helpers to the sites the user switches on, one site at a time.
  - `offscreen`: runs the on-device AI check for text boxes in an extension page instead of the website.
  - **Host permissions (optional, requested per site):** requested only when the user switches Envoy on for a site, so the text-box and upload helpers can run there. No site is enabled by default.
  - **Remote code:** No. All code ships in the package. The side panel shows Envoy's own web app (https://envoy-hybrid-ai.web.app) in a frame, so cloud requests are protected by Firebase App Check.
- **Data usage (what to tick):**
  - Collects **website content**: yes, only the text the user chooses to check, and only on the user's device; the masked excerpt the user approves is sent to Google's Gemini API through Firebase AI Logic to answer the question.
  - Not collected: personally identifiable information (beyond what's in the user's own text), health, financial, authentication, personal communications stored by Envoy, location, web history, user activity.
  - Certify: data is not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.
