import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const releaseId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || new Date().toISOString();
const releaseManifest = {
  name: 'buildtrack-release-manifest',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'release.json', source: JSON.stringify({ id: releaseId }) });
  },
};

// https://vite.dev/config/
export default defineConfig({
  define: { __BUILDTRACK_RELEASE__: JSON.stringify(releaseId) },
  plugins: [releaseManifest,
    react(),
    VitePWA({
      selfDestroying: true, // NUCLEAR OPTION: Unregisters existing SW to fix cache issues
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo192.png', 'logo512.png', 'apple-touch-icon.png', 'hilti-logo.png'],
      manifest: {
        short_name: 'BuildTrack',
        name: 'BuildTrack — Gestion de chantiers',
        icons: [
          {
            src: 'logo192.png',
            type: 'image/png',
            sizes: '192x192',
            purpose: 'any'
          },
          {
            src: 'logo512.png',
            type: 'image/png',
            sizes: '512x512',
            purpose: 'any'
          }
        ],
        start_url: '.',
        display: 'standalone',
        theme_color: '#0f172a',
        background_color: '#0f172a'
      }
    })
  ],
})
