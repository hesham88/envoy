/* global console, process, URL */
// Usage: VITE_APPCHECK_DEBUG_TOKEN=CANARY-1234 npm run build -w @envoy/extension
//        npm run check:dist -w @envoy/extension
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const dist = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
if (!existsSync(dist)) { console.error('dist/ missing: run npm run build -w @envoy/extension first'); process.exit(1); }
const files = readdirSync(dist, { recursive: true }).filter((f) => /\.(js|html|json|map)$/.test(f));
const bad = [];
for (const f of files) { const s = readFileSync(join(dist, f), 'utf8'); if (s.includes('CANARY-1234')) bad.push(f); }
if (bad.length) { console.error('FAIL: debug-token material in dist:', bad.join(', ')); process.exit(1); }
console.log('check:dist PASS - no debug-token material in', files.length, 'files');


