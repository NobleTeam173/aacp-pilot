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
        main:         resolve(__dirname, 'index.html'),
        app:          resolve(__dirname, 'app.html'),
        eoi:          resolve(__dirname, 'eoi.html'),
        aciaRegister: resolve(__dirname, 'acia-register.html'),
        rpasEoi:      resolve(__dirname, 'rpas-eoi.html'),
        privacy:      resolve(__dirname, 'privacy.html'),
        aviation:     resolve(__dirname, 'aviation.html'),
        rpas:         resolve(__dirname, 'rpas.html'),
        acia:         resolve(__dirname, 'acia.html'),
        industry:     resolve(__dirname, 'industry.html'),
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
      '/program': 'http://localhost:8787',
      '/acia': 'http://localhost:8787',
      '/users': 'http://localhost:8787',
      '/organizations': 'http://localhost:8787',
      '/handoff': 'http://localhost:8787',
      '/connector': 'http://localhost:8787',
      '/participant': 'http://localhost:8787',
    },
  },
});
