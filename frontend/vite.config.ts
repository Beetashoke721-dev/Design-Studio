import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Site served by the local bench (see sites/common_site_config.json)
const FRAPPE_SITE = 'studio.com'
const FRAPPE_PORT = 8004

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${FRAPPE_PORT}`,
        changeOrigin: true,
        headers: { Host: FRAPPE_SITE },
      },
      '/private': {
        target: `http://127.0.0.1:${FRAPPE_PORT}`,
        changeOrigin: true,
        headers: { Host: FRAPPE_SITE },
      },
      '/files': {
        target: `http://127.0.0.1:${FRAPPE_PORT}`,
        changeOrigin: true,
        headers: { Host: FRAPPE_SITE },
      },
      '/socket.io': {
        target: `http://127.0.0.1:${FRAPPE_PORT}`,
        ws: true,
        changeOrigin: true,
        headers: { Host: FRAPPE_SITE },
      },
    },
  },
  build: {
    outDir: '../design_studio/public/frontend',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/index[extname]',
      },
    },
  },
  base: '/assets/design_studio/frontend/',
})
