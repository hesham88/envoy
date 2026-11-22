# Store assets (rendered from the real UI, no mockups)

Rendered by `scripts/render-store.mjs` against the built extension in Chrome
(--remote-debugging-port=9335 --enable-unsafe-extension-debugging).

Present:
- screenshot-1-sidepanel.png (1280x800): the side panel.
- screenshot-2-popup.png (1280x800): the popup with per-site opt-in.
- screenshot-3-field.png (1280x800): text box with the Envoy ring and findings card.
- screenshot-4-upload.png (1280x800): the Upload with Envoy dialog.
- screenshot-5-rules.png (1280x800): the side panel at Your rules.
- promo-tile-440x280.png, marquee-1400x560.png: the side panel at those sizes.

All five screenshots are present. screenshot-3-field.png and
screenshot-4-upload.png were captured in the F: Chrome profile (Nano available)
after the popup permission grant, on a local test page: the findings card shows
rules findings plus a model-detected [ADDRESS], and the Upload with Envoy
dialog is open.
