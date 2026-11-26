/**
 * Faces in a photo, found on this device: MediaPipe's BlazeFace (short range) face detector, run
 * from our own files under `base` (the wasm in `${base}/vision/`, the model at `${base}/face.tflite`;
 * no CDN). MediaPipe's usage logging is removed at build time (src/build/no-telemetry.ts).
 *
 * BlazeFace is made for faces that fill a good part of the frame. A document photo often has a
 * small one (the portrait on an ID card), so large images are also scanned in overlapping tiles,
 * and boxes that overlap are merged. Every face becomes a box that is burned in unless the person
 * switches it off, like the text boxes.
 */
import type { MaskBox } from '@envoy/core';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

const iou = (a: Rect, b: Rect) => {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
};

/** Keep the best of each group of overlapping boxes (and drop a box inside a better one). */
export function mergeFaces(rects: Rect[]): Rect[] {
  const kept: Rect[] = [];
  for (const r of [...rects].sort((a, b) => b.score - a.score)) {
    const inside = (o: Rect) =>
      r.x >= o.x - 2 && r.y >= o.y - 2 && r.x + r.w <= o.x + o.w + 2 && r.y + r.h <= o.y + o.h + 2;
    if (!kept.some((k) => iou(k, r) > 0.3 || inside(k))) kept.push(r);
  }
  return kept;
}

/** A face box grown a little (hair, ears and chin identify a person too), inside the image. */
export function faceBox(r: Rect, width: number, height: number): MaskBox {
  const padX = r.w * 0.18;
  const padY = r.h * 0.25;
  const x = Math.max(0, r.x - padX);
  const y = Math.max(0, r.y - padY);
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(Math.min(width, r.x + r.w + padX) - x),
    h: Math.round(Math.min(height, r.y + r.h + padY) - y),
    type: 'FACE',
    value: 'Face',
    on: true,
  };
}

/** Square-ish overlapping tiles for a large image (none for a small one). */
export function tiles(width: number, height: number): { x: number; y: number; w: number; h: number }[] {
  if (Math.max(width, height) < 900) return [];
  const size = Math.round(Math.min(width, height) * 0.6);
  const step = Math.round(size * 0.66);
  // Starts every `step`, and the last tile sits flush with the edge, so corners are covered too.
  const starts = (len: number) => {
    const s: number[] = [];
    for (let p = 0; p + size < len; p += step) s.push(p);
    s.push(Math.max(0, len - size));
    return [...new Set(s)];
  };
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (const y of starts(height))
    for (const x of starts(width))
      out.push({ x, y, w: Math.min(size, width - x), h: Math.min(size, height - y) });
  return out;
}

export async function readFaceBoxes(image: Blob, base: string): Promise<MaskBox[]> {
  try {
    const { FaceDetector } = await import('@mediapipe/tasks-vision');
    const detector = await FaceDetector.createFromOptions(
      {
        wasmLoaderPath: `${base}/vision/vision_wasm_internal.js`,
        wasmBinaryPath: `${base}/vision/vision_wasm_internal.wasm`,
      },
      {
        baseOptions: { modelAssetPath: `${base}/face.tflite`, delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.55,
      },
    );
    const bmp = await createImageBitmap(image);
    const { width, height } = bmp;
    const found: Rect[] = [];
    const collect = (dx: number, dy: number, src: TexImageSource) => {
      for (const d of detector.detect(src).detections) {
        const b = d.boundingBox;
        if (!b) continue;
        found.push({
          x: b.originX + dx,
          y: b.originY + dy,
          w: b.width,
          h: b.height,
          score: d.categories[0]?.score ?? 0,
        });
      }
    };
    try {
      collect(0, 0, bmp);
      if (typeof OffscreenCanvas !== 'undefined')
        for (const t of tiles(width, height)) {
          const c = new OffscreenCanvas(t.w, t.h);
          c.getContext('2d')?.drawImage(bmp, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
          collect(t.x, t.y, c);
        }
    } finally {
      bmp.close?.();
      detector.close();
    }
    return mergeFaces(found).map((r) => faceBox(r, width, height));
  } catch (e) {
    // A face-detector problem must never stop the text masks.
    console.warn('Envoy: face detection failed:', e instanceof Error ? e.message : e);
    return [];
  }
}
