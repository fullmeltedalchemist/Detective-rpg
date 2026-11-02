import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2500,
    rollupOptions: { output: { manualChunks: (id: string) => (id.includes('node_modules/playcanvas') ? 'playcanvas' : undefined) } },
  },
  server: { host: true },
});
