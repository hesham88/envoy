#!/usr/bin/env node
/**
 * Lets PR preview channels use Envoy's browser API key. The key only works from listed website
 * addresses, and Google matches `*` only at the start of a host (`*.example.com`), so
 * `envoy-hybrid-ai--*.web.app` does NOT cover previews; each preview host is added by name.
 *
 * App Check is enforced, so each preview host is also added to the reCAPTCHA Enterprise key's domains.
 *
 * Usage: node scripts/allow-preview.mjs            (adds every live preview channel)
 *        node scripts/allow-preview.mjs <url> ...  (adds those hosts)
 * Needs gcloud signed in as the project owner (hesham1988@gmail.com). Removes nothing else.
 */
import { execFileSync } from 'node:child_process';

const PROJECT = 'envoy-hybrid-ai';
const ACCOUNT = 'hesham1988@gmail.com';
const KEY = '59f96a7d-4150-4970-a613-c4f3e375e567'; // "Browser key (auto created by Firebase)"
const RECAPTCHA_KEY = '6Lfi2iwuAAAAAG1T0dAwdfwrffSJBdt1E6VAllPa'; // "Envoy Web" (public site key)
// Output is captured, never printed (gcloud's update response includes the key string).
const sh = (cmd, args) =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

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

// App Check is enforced: a preview also needs its host on the reCAPTCHA Enterprise key, or it
// gets no App Check token and its cloud step is refused.
const domains = sh('gcloud', [
  'recaptcha',
  'keys',
  'describe',
  RECAPTCHA_KEY,
  `--project=${PROJECT}`,
  `--account=${ACCOUNT}`,
  '--format=value(webSettings.allowedDomains)',
])
  .trim()
  .split(';')
  .filter(Boolean);
const newDomains = urls.map((u) => new URL(u).host).filter((h) => !domains.includes(h));
if (newDomains.length) {
  sh('gcloud', [
    'recaptcha',
    'keys',
    'update',
    RECAPTCHA_KEY,
    `--project=${PROJECT}`,
    `--account=${ACCOUNT}`,
    '--web',
    `--domains=${[...domains, ...newDomains].join(',')}`,

    '--format=none',
  ]);
  console.log(`reCAPTCHA key: allowed ${newDomains.length} preview domain(s).`);
}
if (!added.length) {
  console.log('API key: every preview host is already allowed.');
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
