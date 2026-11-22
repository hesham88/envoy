# Chrome Web Store assets

Rendered from the real built extension, no mockups: `node apps/extension/scripts/render-store.mjs` (after `npm run build -w @envoy/extension`). The built content script runs on `demo-page.html`, a stand-in chat site with fictional details; the built side panel and popup run with a stubbed `chrome.*` API. Basic protection is shown, because the renderer's Chrome has no on-device model.

| File | Shows |
| --- | --- |
| `screenshot-1-text-box.png` (1280×800) | A text box with Envoy on: the amber ring and the findings card. |
| `screenshot-2-replaced.png` (1280×800) | After Replace: tags only in the field, the ring green, the chip "Protected". |
| `screenshot-3-side-panel.png` (1280×800) | The side panel next to the page, with selected text arriving as the document. |
| `screenshot-4-approval.png` (1280×800) | A turn in the side panel: what the cloud will see, and the handoff to Envoy on the web. |
| `screenshot-5-popup.png` (1280×800) | The popup: Envoy on this site, off by default. |
| `promo-tile-440x280.png`, `marquee-1400x560.png` | The seal and the slogan. |
