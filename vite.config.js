import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  // Relative asset paths: the normal PWA deploy (served from a domain root)
  // doesn't care, but the iOS host app serves dist/ from its app bundle via
  // the nvs://app/ scheme handler (native/ios/NVSHost/LocalSchemeHandler.swift),
  // so assets must resolve relative to index.html, not a server root.
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@tensorflow-models')) return 'tf-model'
          if (id.includes('@tensorflow')) return 'tf-core'
          if (id.includes('trystero')) return 'cast'
          if (id.includes('node_modules/react')) return 'react'
        },
      },
    },
  },
})
