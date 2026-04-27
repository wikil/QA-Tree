import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'QA-Tree',
        short_name: 'QA-Tree',
        description:
          'Recursive Q&A tree — explore an LLM topic by branching from any answer; sibling branches stay isolated.',
        theme_color: '#B96A4A',
        background_color: '#F4ECDD',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cache static shell only. LLM endpoints must always go to network so
        // offline mode never replays stale completions.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ico}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.destination === '' &&
              !url.pathname.startsWith('/assets/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
});
