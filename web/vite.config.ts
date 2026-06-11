import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // keep the hand-written public/manifest.webmanifest (share_target!)
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,webmanifest}', 'icon-192.png', 'favicon.png', 'apple-touch-icon.png'],
        // Navigationen NICHT aus dem Precache bedienen: der Browser erzwingt
        // die Security-Header (CSP/COOP) der gecachten Antwort — ein
        // precachtes index.html friert Server-Header-Änderungen ein (so
        // blockierte ein veraltetes COOP das Google-OAuth-Popup). Stattdessen
        // NetworkFirst; offline fällt es auf das precachte Shell zurück.
        navigateFallback: null,
        runtimeCaching: [
          {
            // SPA-Navigationen (API und öffentliche /r/-Rezeptseiten sind
            // server-gerendert und ausgenommen)
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' &&
              !url.pathname.startsWith('/api/') &&
              !url.pathname.startsWith('/r/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 3,
              precacheFallback: { fallbackURL: '/index.html' },
            },
          },
          {
            // day data: fresh when online, last known state when offline
            urlPattern: /\/api\/(diary|goals|widget)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-day',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 },
            },
          },
          {
            // food data changes rarely — serve cached, refresh in background
            urlPattern: /\/api\/foods\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-foods',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: /\/api\/recipes\/[^/]+\/image/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'recipe-images',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'] },
})
