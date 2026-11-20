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

// Real data must never be reachable on the LAN. `--host` (dev or preview) is allowed only with
// `--mode demo`, which drops the /api proxy and forces the app's demo data:
//   npm run dev:lan-demo
function exposedToLan() {
  return process.argv.some((a) => a === '--host' || a.startsWith('--host='));
}

export default defineConfig(({ mode }) => {
  const demoOnly = mode === 'demo';
  if (exposedToLan() && !demoOnly) {
    throw new Error(
      'Refusing --host: the dev server would expose real data on the LAN. ' +
        'Use `npm run dev:lan-demo` (demo data, no API) or open it on this machine only.',
    );
  }
  const proxy = demoOnly ? {} : { '/api': 'http://127.0.0.1:8000' };
  return {
    plugins: [svelte(), fontLicense()],
    resolve: { alias: { '@ds': designSystem } },
    server: { host: demoOnly ? undefined : '127.0.0.1', fs: { allow: ['..'] }, proxy },
    preview: { host: demoOnly ? undefined : '127.0.0.1', proxy },
    build: { outDir: 'dist', emptyOutDir: true },
  };
});
