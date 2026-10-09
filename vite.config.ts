import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.VITE_BASE || '/gitvault/',
  build: { target: 'es2023', sourcemap: false },
  worker: { format: 'es' },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
