import { defineConfig } from 'vite';

// Dev server proxies the game WebSocket to the Node game server (npm run dev).
export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:7777', ws: true },
      '/api': { target: 'http://localhost:7777' },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
});
