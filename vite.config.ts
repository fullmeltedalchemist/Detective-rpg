import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2500,
    rollupOptions: { output: { manualChunks: { playcanvas: ['playcanvas'] } } },
  },
  server: { host: true },
});
