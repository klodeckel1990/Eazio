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
        navigateFallback: '/index.html',
        // API and public recipe pages are server-rendered, never the SPA shell
        navigateFallbackDenylist: [/^\/api\//, /^\/r\//],
        runtimeCaching: [
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
