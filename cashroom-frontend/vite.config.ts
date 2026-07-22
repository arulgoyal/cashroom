import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The browser only ever talks to the BFF (VITE_BFF_URL, default localhost:3001).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // bind 0.0.0.0 so the Docker container is reachable from the host
    port: 5173,
    strictPort: true,
    // HMR websocket must reach the browser via the host-mapped port, not the
    // container's internal hostname — otherwise live-reload silently breaks in Docker.
    hmr: { clientPort: 5173 },
  },
  test: {
    environment: 'jsdom', // gives pure-logic tests a window + localStorage
    include: ['src/**/*.test.ts'],
  },
});
