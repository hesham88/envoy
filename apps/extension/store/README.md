# Chrome Web Store assets

Rendered from the real built extension, no mockups: `node apps/extension/scripts/render-store.mjs` (after `npm run build -w @envoy/extension`). The built content script runs on `demo-page.html`, a stand-in chat site with fictional details; the built side panel and popup run with a stubbed `chrome.*` API. Basic protection is shown, because the renderer's Chrome has no on-device model.

| File                                             | Shows                                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `screenshot-1-text-box.png` (1280×800)           | A text box with Envoy on: the amber ring and the findings card.                                                |
| `screenshot-2-replaced.png` (1280×800)           | After Replace: tags only in the field, the ring green, the chip "Protected".                                   |
| `screenshot-3-upload.png` (1280×800)             | Upload with Envoy: a fictional ID-card photo (`sample-id-card.jpg`) with a black box drawn over the ID number. |
| `screenshot-4-approval.png` (1280×800)           | The side panel (the hosted Envoy chat it embeds in release builds) waiting for approval.                       |
| `screenshot-5-popup.png` (1280×800)              | The popup: Envoy on this site, off by default.                                                                 |
| `promo-tile-440x280.png`, `marquee-1400x560.png` | The seal and the slogan.                                                                                       |
| `store-icon-128.png`                             | The store icon (the extension's own 128 px icon).                                                              |

All screenshots and tiles are flattened to 24-bit PNG with no alpha, as the store requires.
