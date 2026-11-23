/**
 * Re-points code links to the line that holds their symbol, after code moves. Covers the README
 * and docs (`[`symbol`](path#Lnn)`) and the landing page refs (`['path', nn, 'symbol']`).
 * `apps/web/src/landing/links.test.ts` fails when a link drifts; this fixes it.
 *
 * Usage: node scripts/fix-anchors.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** An import line, or one name inside a multi-line import list ("  checkOutbound,"). */
const isImport = (l) =>
  /^\s*(?:import\b|export\s*\{[^}]*\}\s*from\b|\}\s*from\s)/.test(l) ||
  /^\s+[A-Za-z_$][\w$]*,?\s*$/.test(l);

/** The best line for a symbol: its declaration if there is one, else its first use. */
function lineFor(file, symbol) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const decl = new RegExp(`(?:function|const|class|let|interface|type)\\s+${esc(symbol)}\\b`);
  let i = lines.findIndex((l) => decl.test(l));
  // Never an import line: a judge following "where getAI is called" should land on the call.
  if (i === -1) i = lines.findIndex((l) => l.includes(symbol) && !isImport(l));
  return i === -1 ? null : i + 1;
}

let changed = 0;
for (const doc of [
  'README.md',
  'docs/MEASUREMENT.md',
  'docs/EVAL.md',
  'apps/extension/README.md',
]) {
  const path = resolve(ROOT, doc);
  const base = dirname(path);
  const text = readFileSync(path, 'utf8');
  const next = text.replace(/\[`([^`]+)`\]\(([^)\s#]+)#L(\d+)\)/g, (m, symbol, target, line) => {
    const file = resolve(base, target);
    const current = readFileSync(file, 'utf8').split('\n')[Number(line) - 1] ?? '';
    if (current.includes(symbol) && !isImport(current)) return m;
    const fixed = lineFor(file, symbol);
    if (!fixed) {
      console.error(`${doc}: ${symbol} not found in ${relative(ROOT, file)}`);
      process.exitCode = 1;
      return m;
    }
    changed++;
    return `[\`${symbol}\`](${target}#L${fixed})`;
  });
  if (next !== text) writeFileSync(path, next);
}

const landing = resolve(ROOT, 'apps/web/src/landing/Landing.tsx');
const src = readFileSync(landing, 'utf8');
const nextSrc = src.replace(/\['([^']+)', (\d+), '([^']+)'\]/g, (m, target, line, symbol) => {
  const file = resolve(ROOT, target);
  const current = readFileSync(file, 'utf8').split('\n')[Number(line) - 1] ?? '';
  if (current.includes(symbol)) return m;
  const fixed = lineFor(file, symbol);
  if (!fixed) {
    console.error(`Landing.tsx: ${symbol} not found in ${target}`);
    process.exitCode = 1;
    return m;
  }
  changed++;
  return `['${target}', ${fixed}, '${symbol}']`;
});
if (nextSrc !== src) writeFileSync(landing, nextSrc);
console.log(`${changed} link(s) re-pointed`);
