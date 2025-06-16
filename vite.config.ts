import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api/lowman': {
        target: 'https://api.lowman-central.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/lowman/, '')
      }
    }
  }
}); 