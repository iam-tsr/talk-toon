import { defineConfig } from 'vite';

const apiProxy = {
  '/talk': 'http://127.0.0.1:8000',
  '/health': 'http://127.0.0.1:8000',
};

export default defineConfig({
  root: 'web',
  // Backend credentials stay in the Python process, outside Vite's source root.
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: apiProxy,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
