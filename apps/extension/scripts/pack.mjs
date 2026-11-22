/* global console, process, Buffer */
// Builds the release (already done by npm run pack's build step), then zips dist/
// into envoy-extension-<version>.zip with STORE entries. Run check:dist first.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'manifest.json'))) { console.error('dist/ missing: run npm run build -w @envoy/extension'); process.exit(1); }
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const files = readdirSync(dist, { recursive: true }).filter((f) => !f.endsWith('.map') && statSync(join(dist, f)).isFile());
const chunks = [];
const central = [];
let offset = 0;
for (const rel of files) {
  const data = readFileSync(join(dist, rel));
  const name = rel.split(String.fromCharCode(92)).join(String.fromCharCode(47));
  const nameBuf = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  chunks.push(local, nameBuf, data);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
  cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
  central.push(cen, nameBuf);
  offset += 30 + nameBuf.length + data.length;
}
const centralSize = central.reduce((n, b) => n + b.length, 0);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralSize, 12); eocd.writeUInt32LE(offset, 16);
const out = join(root, `envoy-extension-${version}.zip`);
writeFileSync(out, Buffer.concat([...chunks, ...central, eocd]));
console.log(`packed ${files.length} files -> ${out}`);
