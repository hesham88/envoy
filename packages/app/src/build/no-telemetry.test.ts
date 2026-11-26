// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { stripTelemetry } from './no-telemetry';

const require = createRequire(import.meta.url);
const bundlePath = require.resolve('@mediapipe/tasks-vision').replace(/vision_bundle\.c?js$/, 'vision_bundle.mjs');

describe('MediaPipe telemetry is removed at build time', () => {
  it('the installed bundle loses its logging URL, timer and send', () => {
    const code = readFileSync(bundlePath, 'utf8');
    expect(code).toContain('odml.pa.googleapis.com'); // the unpatched package does phone home
    const out = stripTelemetry(bundlePath, code);
    expect(out).not.toContain('odml.pa.googleapis.com');
    expect(out).not.toContain('this.flush()},6e4)');
    expect(out).toContain('flush(t,e){this.i=[];t?.();return;');
  });

  it('leaves other modules alone, and fails loudly if the package changes', () => {
    expect(stripTelemetry('/x/node_modules/other/index.js', 'setInterval(()=>{})')).toBe(
      'setInterval(()=>{})',
    );
    expect(() =>
      stripTelemetry('/x/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs', 'changed'),
    ).toThrow(/no longer matches/);
  });
});
