// @vitest-environment node
/**
 * Judges verify claims by following code links. Every link in the README, the measurement docs and
 * the landing page must point at a file that exists, and a line link must land on the symbol it names.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GUARD, STEPS, type CodeRef } from './Landing';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const lineOf = (path: string, n: number) =>
  readFileSync(resolve(ROOT, path), 'utf8').split('\n')[n - 1] ?? '';

describe('code links', () => {
  for (const doc of [
    'README.md',
    'docs/BRING_YOUR_OWN.md',
    'docs/MEASUREMENT.md',
    'docs/EVAL.md',
    'apps/extension/README.md',
  ]) {
    it(`${doc}: every relative link exists, and line links land on their symbol`, () => {
      const text = readFileSync(resolve(ROOT, doc), 'utf8');
      const base = dirname(resolve(ROOT, doc));
      const links = [...text.matchAll(/\[([^\]]*)\]\(([^)\s#]+)(?:#L(\d+))?\)/g)].filter(
        ([, , target]) => !/^(https?:|mailto:|#)/.test(target!),
      );
      for (const [, label, target, line] of links) {
        const file = resolve(base, target!);
        expect(existsSync(file), `${doc}: ${target} is missing`).toBe(true);
        if (line) {
          const symbol = /^`([^`]+)`$/.exec(label!)?.[1];
          expect(
            symbol,
            `${doc}: name the symbol in the link text for ${target}#L${line}`,
          ).toBeTruthy();
          const linked = readFileSync(file, 'utf8').split('\n')[Number(line) - 1] ?? '';
          expect(
            /^\s*import\b|^\s+[A-Za-z_$][\w$]*,?\s*$|\}\s*from\s/.test(linked),
            `${doc}: ${target}#L${line} is an import line: link the definition or the call (run node scripts/fix-anchors.mjs)`,
          ).toBe(false);
          expect(
            linked,
            `${doc}: ${target}#L${line} should contain ${symbol} (run node scripts/fix-anchors.mjs)`,
          ).toContain(symbol!);
        }
      }
    });
  }

  it('the landing page links land on their symbols', () => {
    const refs: CodeRef[] = [...STEPS.map((s) => s.code), ...GUARD.map((g) => g[2])];
    for (const [path, line, symbol] of refs) {
      expect(existsSync(resolve(ROOT, path)), `${path} is missing`).toBe(true);
      if (line)
        expect(lineOf(path, line), `${path}#L${line} (run node scripts/fix-anchors.mjs)`).toContain(
          symbol,
        );
    }
  });
});
