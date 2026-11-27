#!/usr/bin/env node
/**
 * Exports what the TypeScript engine (@envoy/core) finds, so the Android app's Kotlin port is tested
 * against the very same answers (parity), and the sample documents the app offers in one tap.
 *   android/app/src/test/resources/parity.json   rules findings + guard cases (unit tests only)
 *   android/app/src/main/assets/samples.json     the fictional sample documents and questions
 * It bundles packages/core with Vite's build API (the core ships TypeScript only), then runs it.
 * Usage: node scripts/export-android-fixtures.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'node_modules/.cache/android-fixtures');
await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    ssr: resolve(ROOT, 'packages/core/src/index.ts'),
    outDir: OUT,
    emptyOutDir: true,
    rollupOptions: { output: { format: 'es', entryFileNames: 'core.mjs' } },
  },
});
const core = await import(pathToFileURL(resolve(OUT, 'core.mjs')).href);

const docs = [
  ['lease', core.EN_LEASE],
  ['offer', core.EN_OFFER],
  ['lab', core.EN_LAB],
  ['freelance', core.EN_FREELANCE],
  ['loan', core.EN_LOAN],
];
// Short strings that pin down edge cases the samples don't cover.
const extra = [
  'Call +20 100 555 0192 or 0020 100 555 0192, office (02) 2735 1100.',
  'Card 4532 0151 1283 0366 and 4532015112830367 (not Luhn).',
  'IBAN EG380019000500000000263180002 and DE89 3704 0044 0532 0130 00.',
  'National ID 29503140101234 and 2950 3140 1012 34.',
  'Pay EGP 8,500 or USD 1,200.50, or 9,350 pounds.',
  'Signed 15 August 2024, due March 3, 2025, 01/09/2024, 2024-09-01.',
  'Vehicle registration: 7ABC123. Parked: AB12 CDE. Le véhicule AB-123-CD.',
  'api_key = sk-test-51HfakeFAKEfake0000 and policy no. 88-4410-2093.',
  'mona.adel@example.com lives at 14 El Nasr St, Maadi, Cairo.',
];
const strip = (e) => ({ type: e.type, value: e.value, start: e.start, end: e.end });
const rules = [...docs.map(([, d]) => d.text), ...extra].map((text) => ({
  text,
  entities: core.detectWithRules(text).map(strip),
  // Names and companies the rules can't know about (Basic protection relies on these).
  names: core.flagNames(text, core.detectWithRules(text)).map(strip),
}));

// Outbound guard: the raw values of the lease must be caught however they are written.
const lease = core.EN_LEASE.text;
const leaseEntities = core.detectWithRules(lease);
const guardCases = [
  'Rent is [RENT] and the landlord is [LANDLORD].',
  'Rent is EGP 8,500.',
  'Account EG38 0019 0005 0000 0000 2631 8000 2',
  'Account EG3800190005000000002631 80002',
  'Phone +20-100-555-0192',
  'Phone +2 0 1 0 0 5 5 5 0 1 9 2',
  'Write to mona.adel@example.com',
].map((outbound) => ({
  outbound,
  leaks: core.checkOutbound(outbound, leaseEntities).leaks.map((l) => l.type),
}));

const parityPath = resolve(ROOT, 'android/app/src/test/resources/parity.json');
mkdirSync(dirname(parityPath), { recursive: true });
writeFileSync(
  parityPath,
  JSON.stringify({ generatedFrom: '@envoy/core', rules, guard: { lease, cases: guardCases } }, null, 1),
);

const samplesPath = resolve(ROOT, 'android/app/src/main/assets/samples.json');
mkdirSync(dirname(samplesPath), { recursive: true });
const questions = {
  lease: ['Can my landlord raise the rent 20% this year?', 'What is my monthly rent?'],
  offer: ['How much paid leave do I get?', 'What is my take-home pay if 22% is deducted?'],
  lab: ['Which results are out of range?', 'What is the total lab fee?'],
};
writeFileSync(
  samplesPath,
  JSON.stringify(
    docs
      .filter(([k]) => questions[k])
      .map(([key, d]) => ({ key, title: d.title, notice: d.notice, text: d.text, questions: questions[key] })),
    null,
    1,
  ),
);
console.log(
  `android fixtures: ${rules.length} rule cases, ${guardCases.length} guard cases; ${Object.keys(questions).length} samples`,
);
