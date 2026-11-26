/**
 * Build-time removal of MediaPipe's usage logging (used by both the web app and the extension).
 *
 * @mediapipe/tasks-vision 1.2.3 creates a usage logger with every task. Every 60 seconds it
 * POSTs task names and timings (no image data) to odml.pa.googleapis.com, and it has no option to
 * turn that off. A privacy tool that runs the face detector on your photo must not phone home, and
 * our CSP would block the call anyway (a console error, and an outbound attempt anyone watching the
 * network can see). This patch, on the exact pinned version:
 *  - never starts the 60-second flush timer,
 *  - makes flush() drop its queue without sending,
 *  - removes the logging URL from the bundle.
 * If any pattern is missing (the package changed), the build fails instead of shipping telemetry.
 */
import type { Plugin } from 'vite';

const MEDIAPIPE = /[\\/]@mediapipe[\\/]tasks-vision[\\/]vision_bundle\.m?js$/;
const PATCHES: [string, string][] = [
  ['this.h=setInterval(()=>{this.flush()},6e4)', 'this.h=void 0'],
  ['flush(t,e){if(this.error)', 'flush(t,e){this.i=[];t?.();return;if(this.error)'],
  ['"https://odml.pa.googleapis.com/v1/log"', '""'],
];

/** Patch one module's source; returns it unchanged if it isn't MediaPipe's bundle. */
export function stripTelemetry(id: string, code: string): string {
  if (!MEDIAPIPE.test(id.split('?')[0]!)) return code;
  let out = code;
  for (const [from, to] of PATCHES) {
    if (!out.includes(from))
      throw new Error(
        `MediaPipe telemetry patch no longer matches (${from.slice(0, 40)}…); re-check the pinned @mediapipe/tasks-vision before building.`,
      );
    out = out.split(from).join(to);
  }
  return out;
}

export function noTelemetry(): Plugin {
  return {
    name: 'envoy-no-telemetry',
    enforce: 'pre',
    transform(code, id) {
      const out = stripTelemetry(id, code);
      // An empty map: the source map must not carry the unpatched original in sourcesContent.
      return out === code ? null : { code: out, map: { mappings: '' } };
    },
  };
}
