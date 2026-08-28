import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'

// ✅ Batch 55: Using Vite's `command` parameter instead of process.env to avoid ESLint no-undef errors
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // ✅ Nazer 3 Fix: Removed favicon.svg (doesn't exist)
      includeAssets: ['icon-192.png', 'icon-512.png', 'icons.svg'],
      manifest: {
        id: '/', // ✅ Nazer 3 Fix: Added id for desktop install
        name: 'MohammadOS',
        short_name: 'MohammadOS',
        description: 'System Kernel v1.1 - Personal Operating System',
        theme_color: '#0B0F14',
        background_color: '#0B0F14',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // Batch 39: Updated icons array for Android/iOS compatibility
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        // ✅ Nazer 3 Fix: Added screenshots for desktop install prompt
        screenshots: [
          {
            src: '/icon-512.png', // Using icon-512 as placeholder screenshot
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'wide'
          }
        ],
        // ✅ Nazer 3 Fix: Added shortcuts for Android/Windows long-press menu
        shortcuts: [
          {
            name: 'ثبت عادت',
            short_name: 'عادت',
            description: 'ثبت سریع عادت یا رویداد جدید',
            url: '/add',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'برنامه هفتگی',
            short_name: 'هفته',
            description: 'مشاهده برنامه هفتگی',
            url: '/week',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    }),
    // ✅ Batch 55: visualizer only in dev (command === 'serve') — saves ~49% build time
    command === 'serve' && visualizer({
      open: false,
      filename: 'bundle-stats.html',
      gzipSize: true,
      brotliSize: true,
    })
  ],
  // Restore Proxy (Batch 39.5)
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Batch 39.5: Robust manualChunks function with fallback
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router') || id.includes('@remix-run')) {
              return 'router';
            }
            if (id.includes('react') || id.includes('scheduler')) {
              return 'react';
            }
            if (id.includes('dexie')) {
              return 'db';
            }
            return 'vendor'; // ← Critical fallback
          }
        }
      }
    }
  }
}))
