# On-device models shipped with Envoy

| File | What | Source | Licence | SHA-256 |
| --- | --- | --- | --- | --- |
| `blaze_face_short_range.tflite` (229,746 bytes) | MediaPipe BlazeFace short-range face detector, float16 | `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite` (downloaded 27 Nov 2026) | Apache-2.0 (MediaPipe models) | `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f` |

`scripts/copy-ocr-assets.mjs` copies it to `<app>/public/ocr/face.tflite` at build time, next to the MediaPipe
wasm (`@mediapipe/tasks-vision` 1.2.3, Apache-2.0), so the face detector runs from our own origin or extension
package. MediaPipe's usage logging is removed at build time: `packages/app/src/build/no-telemetry.ts`.
