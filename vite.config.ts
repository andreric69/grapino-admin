import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // injectManifest statt generateSW, weil der Service Worker eigene
    // push/notificationclick-Listener braucht (src/sw.ts) - generateSW
    // erlaubt keinen eigenen Handler-Code.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
      },
      manifest: {
        name: 'Grapino Admin',
        short_name: 'Grapino Admin',
        description: 'Admin-Werkzeug fuer Grapino',
        theme_color: '#7c2d3a',
        background_color: '#f3f2f2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
