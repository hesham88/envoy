// @vitest-environment node
/**
 * Every script that starts Chrome keeps its profile on the repo's drive and deletes it before exit
 * (scripts/lib/scratch.mjs). Incident, 26 Nov 2026: 57 Chrome profiles were left in C:\...\Temp,
 * 39 of them from this extension's e2e run, whose cleanup sat in a setTimeout that the
 * process.exit() right after it never let fire.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SKIP = new Set(['node_modules', 'dist', 'dist-dev', '.git', 'public', 'coverage', 'out']);

function scripts(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name) && !e.name.startsWith('.')) scripts(join(dir, e.name), out);
    } else if (/\.(mjs|cjs|js)$/.test(e.name)) out.push(join(dir, e.name));
  }
  return out;
}

/** What is wrong with one script's source, or [] when it is fine. */
function scratchProblems(src: string): string[] {
  const problems: string[] = [];
  if (/\btmpdir\s*\(/.test(src)) problems.push('uses os.tmpdir() (C:\\...\\Temp on Windows)');
  if (/setTimeout\([^;]{0,80}rmSync/.test(src))
    problems.push('deletes in a setTimeout (process.exit() skips it)');
  const startsChrome = /chromium\.launch(PersistentContext)?\(|--user-data-dir=/.test(src);
  if (startsChrome && !/scripts\/lib\/scratch\.mjs|\.\/lib\/scratch\.mjs/.test(src))
    problems.push('starts Chrome without importing scripts/lib/scratch.mjs');
  return problems;
}

describe('Chrome scratch space', () => {
  it('flags the patterns that leaked profiles into C:\\...\\Temp', () => {
    // The e2e script as it was before the fix.
    const before = `import { chromium } from 'playwright-core';
const WORK = join(tmpdir(), \`envoy-e2e-\${Date.now()}\`);
spawn(exe, [\`--user-data-dir=\${PROFILE}\`]);
setTimeout(() => rmSync(WORK, { recursive: true, force: true }), 500);
process.exit(0);`;
    expect(scratchProblems(before)).toHaveLength(3);
    const after = `import { removeScratch, scratchDir } from '../../../scripts/lib/scratch.mjs';
const WORK = scratchDir('envoy-e2e');
spawn(exe, [\`--user-data-dir=\${PROFILE}\`]);
removeScratch(WORK);`;
    expect(scratchProblems(after)).toEqual([]);
  });

  it('no script in the repo starts Chrome with its profile in the system TEMP', () => {
    const files = ['apps', 'scripts', 'tests', 'video', 'packages'].flatMap((d) =>
      scripts(join(ROOT, d)),
    );
    expect(files.length).toBeGreaterThan(10);
    const bad = files
      .filter((f) => !f.endsWith(join('scripts', 'lib', 'scratch.mjs')))
      .map((f) => [relative(ROOT, f), scratchProblems(readFileSync(f, 'utf8'))] as const)
      .filter(([, p]) => p.length)
      .map(([f, p]) => `${f}: ${p.join('; ')}`);
    expect(bad).toEqual([]);
  });
});
