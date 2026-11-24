#!/usr/bin/env node
/**
 * Lets PR preview channels use Envoy's browser API key. The key only works from listed website
 * addresses, and Google matches `*` only at the start of a host (`*.example.com`), so
 * `envoy-hybrid-ai--*.web.app` does NOT cover previews; each preview host is added by name.
 *
 * Usage: node scripts/allow-preview.mjs            (adds every live preview channel)
 *        node scripts/allow-preview.mjs <url> ...  (adds those hosts)
 * Needs gcloud signed in as the project owner (hesham1988@gmail.com). Removes nothing else.
 */
import { execFileSync } from 'node:child_process';

const PROJECT = 'envoy-hybrid-ai';
const ACCOUNT = 'hesham1988@gmail.com';
const KEY = '59f96a7d-4150-4970-a613-c4f3e375e567'; // "Browser key (auto created by Firebase)"
const sh = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });

let urls = process.argv.slice(2);
if (!urls.length) {
  const out = sh('firebase', ['hosting:channel:list', '--project', PROJECT, '--account', ACCOUNT]);
  urls = [...out.matchAll(/https:\/\/envoy-hybrid-ai--[a-z0-9-]+\.web\.app/g)].map((m) => m[0]);
}
const current = sh('gcloud', [
  'services',
  'api-keys',
  'describe',
  KEY,
  `--project=${PROJECT}`,
  `--account=${ACCOUNT}`,
  '--format=value(restrictions.browserKeyRestrictions.allowedReferrers)',
])
  .trim()
  .split(';')
  .filter(Boolean);
const wanted = urls.map((u) => `${new URL(u).origin}/*`);
const added = wanted.filter((r) => !current.includes(r));
if (!added.length) {
  console.log('Every preview host is already allowed.');
  process.exit(0);
}
const services = sh('gcloud', [
  'services',
  'api-keys',
  'describe',
  KEY,
  `--project=${PROJECT}`,
  `--account=${ACCOUNT}`,
  '--format=value(restrictions.apiTargets.service)',
])
  .trim()
  .split(';')
  .filter(Boolean);
sh('gcloud', [
  'services',
  'api-keys',
  'update',
  KEY,
  `--project=${PROJECT}`,
  `--account=${ACCOUNT}`,
  `--allowed-referrers=${[...current, ...added].join(',')}`,
  ...services.map((s) => `--api-target=service=${s}`),
  '--format=none',
]);
console.log(`Allowed ${added.length} preview host(s):\n  ${added.join('\n  ')}`);
