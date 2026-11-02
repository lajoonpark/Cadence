import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Two pages: the shop (index.html) and the small window the global shortcut pops up (mini.html).
export default defineConfig({
  base: './',
  server: { port: 5173, host: '127.0.0.1' },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        mini: resolve(import.meta.dirname, 'mini.html'),
      },
    },
  },
});
