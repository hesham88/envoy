/**
 * Scratch space for every script that starts Chrome (e2e, smoke, film, renders, evals).
 *
 * Chrome profiles are big (tens of MB each) and the system TEMP is on C:, which is nearly full on
 * the dev machine. Importing this module, as the first import, does three things:
 *   1. points TEMP, TMP and TMPDIR at <repo>/node_modules/.cache/envoy-tmp (on the repo's own
 *      drive; already ignored by git, ESLint, Prettier and Vitest), so our profiles, the ones
 *      Playwright makes for chromium.launch(), and Chrome's own temp files all land there;
 *   2. removes leftovers older than 6 hours (runs that were killed before they could clean up);
 *   3. gives scratchDir / stopChrome / removeScratch, so a run deletes its own folder before it
 *      exits. (The old e2e cleanup ran in a setTimeout that process.exit() never let fire.)
 *
 * Override the location with ENVOY_SCRATCH.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const SCRATCH =
  process.env.ENVOY_SCRATCH || join(REPO, 'node_modules', '.cache', 'envoy-tmp');
mkdirSync(SCRATCH, { recursive: true });
for (const k of ['TEMP', 'TMP', 'TMPDIR']) process.env[k] = SCRATCH;

const STALE_MS = 6 * 3600 * 1000;
for (const name of readdirSync(SCRATCH)) {
  const p = join(SCRATCH, name);
  try {
    if (Date.now() - statSync(p).mtimeMs > STALE_MS)
      rmSync(p, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // Still in use by another run, or already gone: leave it.
  }
}

/** A new, empty folder for this run, named `<prefix>-XXXXXX`. */
export function scratchDir(prefix) {
  return mkdtempSync(join(SCRATCH, `${prefix}-`));
}

/**
 * Remove a run's folder now, synchronously. Retries while Windows still holds Chrome's files.
 * Call it after Chrome has exited and before process.exit().
 */
export function removeScratch(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    return true;
  } catch (e) {
    console.warn(`scratch: could not remove ${dir} (${e.code}); the next run removes it`);
    return false;
  }
}

/**
 * Stop a Chrome we spawned and wait for it to exit: politely through CDP (Browser.close) when a
 * browser CDP session is given, then by kill. Its profile can only be deleted once it has exited.
 */
export async function stopChrome(child, cdp) {
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  if (exited()) return;
  const gone = new Promise((r) => child.once('exit', r));
  const wait = (ms) => Promise.race([gone, new Promise((r) => setTimeout(r, ms))]);
  if (cdp) await cdp.send('Browser.close').catch(() => undefined);
  await wait(5000);
  if (!exited()) {
    child.kill();
    await wait(5000);
  }
}
