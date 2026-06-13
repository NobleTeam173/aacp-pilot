import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/auth': 'http://localhost:8787',
      '/dashboard': 'http://localhost:8787',
      '/audit': 'http://localhost:8787',
      '/privacy': 'http://localhost:8787',
      '/ai': 'http://localhost:8787',
      '/telemetry': 'http://localhost:8787',
    },
  },
});
