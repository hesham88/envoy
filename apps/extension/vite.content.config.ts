import { defineConfig } from 'vite';

// Content script: one self-contained IIFE file (no chunks, no module imports at runtime).
export default defineConfig({
  envDir: '../web',
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    lib: { entry: 'src/content/index.ts', name: 'EnvoyContent', formats: ['iife'], fileName: () => 'content.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
