import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/recognize': 'http://localhost:4000',
      '/health': 'http://localhost:4000',
      '/reset-breaker': 'http://localhost:4000',
    },
  },
});