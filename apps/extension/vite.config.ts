import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { noTelemetry } from '../../packages/app/src/build/no-telemetry';
import { noRemoteCode } from './no-remote-code';

// Manifest V3: no remotely hosted code, not even an unused script URL (Web Store rejection, 26 Nov).
// Release builds never use App Check (on-device only; cloud questions open the web app), so
// `firebase/app-check` is an inert local stub. Developer builds keep it for the debug token.
export const noRemoteAlias = (mode: string): Record<string, string> =>
  mode === 'extensiondev'
    ? {}
    : { 'firebase/app-check': '/src/stubs/app-check.ts' };

// Firebase config is shared with the web app: env vars are read from apps/web/.env.local.
// dist/ only ever holds the release build (no App Check debug token); dev builds go to dist-dev/.
export default defineConfig(({ mode }) => ({
  plugins: [noTelemetry(), noRemoteCode(), react(), tailwindcss()],
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
  resolve: { alias: noRemoteAlias(mode) },
  base: './',
  envDir: '../web',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    // Maps are left out of the store zip anyway; building them cost Rolldown gigabytes on 16 GB machines.
    sourcemap: process.env.EXT_SOURCEMAP === '1',
    rollupOptions: {
      input: { sidepanel: 'sidepanel.html', popup: 'popup.html', offscreen: 'offscreen.html' },
    },
  },
}));
