import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  base: process.env.VITE_BASE || '/gitvault/',
  build: {
    target: 'es2023', sourcemap: false,
    rollupOptions: { input: {
      main: fileURLToPath(new URL('./index.html', import.meta.url)),
      folder: fileURLToPath(new URL('./folder.html', import.meta.url)),
    } },
  },
  worker: { format: 'es' },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
