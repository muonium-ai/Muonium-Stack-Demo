import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const playgroundRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: playgroundRoot,
  publicDir: 'public',
  server: {
    port: 5174,
    strictPort: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  preview: {
    port: 4174,
    strictPort: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  build: {
    outDir: resolve(playgroundRoot, 'dist'),
    emptyOutDir: true,
  },
});
