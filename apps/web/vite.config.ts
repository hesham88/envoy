import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { noTelemetry } from '../../packages/app/src/build/no-telemetry';

export default defineConfig({
  plugins: [
    // MediaPipe (face detector) phones home every minute; removed at build (packages/app/src/build).
    noTelemetry(),
    react(),
    tailwindcss(),
    // Precaches the app shell so Envoy opens offline; on-device answers then need no network at all.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script', // external registerSW.js: no inline script, so the strict CSP holds
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Envoy — your private AI agent to the cloud',
        short_name: 'Envoy',
        description: 'On-device AI shares only what the cloud needs, and you approve it.',
        theme_color: '#0B0A1C',
        background_color: '#0B0A1C',
        display: 'standalone',
        start_url: '/app',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,mjs}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/__/],
      },
    }),
  ],
  build: { sourcemap: true, target: 'es2022' },
  // Pre-bundled deps skip plugins: keep MediaPipe out so the telemetry patch applies in dev too.
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
  server: { port: 5173, strictPort: true },
});
