import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/avalai': {
        target: 'https://api.avalai.ir',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/avalai/, ''),
      },
    },
  },
})