import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const designSystem = fileURLToPath(new URL('../design-system', import.meta.url));

// The fonts are bundled into assets/ under hashed names; their license must ship beside them.
function fontLicense() {
  return {
    name: 'hr-font-license',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'assets/OFL.txt',
        source: readFileSync(`${designSystem}/fonts/OFL.txt`),
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), fontLicense()],
  resolve: { alias: { '@ds': designSystem } },
  server: {
    fs: { allow: ['..'] },
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
