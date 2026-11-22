import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Firebase config is shared with the web app: env vars are read from apps/web/.env.local.
// dist/ only ever holds the release build (no App Check debug token); dev builds go to dist-dev/.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  envDir: '../web',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    rollupOptions: { input: { sidepanel: 'sidepanel.html' } },
  },
});
