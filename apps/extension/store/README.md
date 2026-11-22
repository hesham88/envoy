# Store assets (rendered from the real UI, no mockups)

Rendered by `scripts/render-store.mjs` against the built extension in Chrome
(--remote-debugging-port=9335 --enable-unsafe-extension-debugging).

Present:
- screenshot-1-sidepanel.png (1280x800): the side panel.
- screenshot-2-popup.png (1280x800): the popup with per-site opt-in.
- screenshot-5-rules.png (1280x800): the side panel at Your rules.
- promo-tile-440x280.png, marquee-1400x560.png: the side panel at those sizes.

Still to capture (needs a human click): field and upload shots. Chrome shows a
native permission prompt for the optional host permission, which automation
cannot accept. To finish: load the extension, open the popup on a test page,
switch Envoy on (accept the prompt), focus a text box, then capture the ring
and the Upload with Envoy dialog at 1280x800 as screenshot-3-field.png and
screenshot-4-upload.png.
