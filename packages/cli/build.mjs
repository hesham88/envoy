import { build } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chmodSync } from 'node:fs';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(__dirname, 'dist/cli.mjs');

await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    ssr: resolve(__dirname, 'src/cli.ts'),
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'node20',
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: 'cli.mjs',
        banner: '#!/usr/bin/env node',
      },
    },
  },
  ssr: {
    noExternal: ['@envoy/core'],
  },
});

try {
  chmodSync(outFile, 0o755);
} catch {
  // Windows ignores POSIX chmod
}
process.stdout.write(`Built ${outFile}\n`);
