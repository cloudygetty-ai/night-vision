import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
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
