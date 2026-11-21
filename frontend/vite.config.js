import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
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

// The service worker (sw.js) is generated after each build from what the build actually wrote:
// it precaches exactly those files (HTML, JS, CSS, fonts, icons, manifest) under a cache named
// for a hash of their contents, so every deploy gets a new cache and an "Update available"
// prompt. The template is src/sw-template.js; nothing from /api/ is ever listed or cached.
function serviceWorker() {
  let outDir;
  const SKIP = new Set(['sw.js', 'assets/OFL.txt']);
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  return {
    name: 'hr-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => !SKIP.has(f) && !f.endsWith('.map'))
        .sort();
      const template = readFileSync(fileURLToPath(new URL('./src/sw-template.js', import.meta.url)), 'utf8');
      const hash = createHash('sha256').update(template); // a worker-only change is a new version too
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const code = template
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('[] /* __FILES__ */', JSON.stringify(files.map((f) => `/${f}`), null, 2));
      writeFileSync(join(outDir, 'sw.js'), code);
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
    plugins: [svelte(), fontLicense(), serviceWorker()],
    resolve: { alias: { '@ds': designSystem } },
    server: { host: demoOnly ? undefined : '127.0.0.1', fs: { allow: ['..'] }, proxy },
    preview: { host: demoOnly ? undefined : '127.0.0.1', proxy },
    build: { outDir: 'dist', emptyOutDir: true },
  };
});
