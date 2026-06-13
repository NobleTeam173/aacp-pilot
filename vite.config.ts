import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
      },
    },
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
