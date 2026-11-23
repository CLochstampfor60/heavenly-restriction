// Demo-data screenshots at 360 x 780, scale 3 (1080 px wide), in DEMO-DATA MODE ONLY (made-up program and history).
//
//   npm run screenshots        (builds first, then writes docs/screenshots/*.png)
//
// Serves the built app with `vite preview` (no API, so real data cannot appear) and drives an
// installed Edge or Chrome through playwright-core; no browser download needed.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const OUT = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}`;

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // try the next installed browser
    }
  }
  throw new Error('Needs Microsoft Edge or Google Chrome installed.');
}

// A fresh context per shot: empty IndexedDB, demo mode on, chosen theme.
async function shot(browser, name, path, { theme = 'dark', act } = {}) {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3 });
  await context.addInitScript((t) => {
    localStorage.setItem('hr-demo', '1');
    localStorage.setItem('hr-theme', t);
  }, theme);
  const page = await context.newPage();
  const fail = [];
  page.on('pageerror', (e) => fail.push(e.message));
  page.on('request', (r) => r.url().includes('/api/') && fail.push(`API request in demo mode: ${r.url()}`));
  await page.goto(`${BASE}/${path}`);
  await page.waitForSelector('.app__scroll, .app__bar');
  if (act) await act(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}${name}.png` });
  await context.close();
  if (fail.length) throw new Error(`${name}: ${fail.join('; ')}`);
  console.log(`docs/screenshots/${name}.png`);
}

mkdirSync(OUT, { recursive: true });
const server = await preview({ preview: { port: PORT, strictPort: true, host: '127.0.0.1' } });
const browser = await launch();
try {
  await shot(browser, 'today', '#/');
  // Lat Pulldown is mid-exercise in the demo; one set above its best shows the PR banner.
  await shot(browser, 'set-logging', '#/log/s2', {
    act: async (page) => {
      const here = page.locator('.pager-page:not([inert])'); // the pager also renders its neighbors
      const [weight, reps] = await here.locator('.hr-stepper input').all();
      await weight.fill('145');
      await weight.dispatchEvent('change');
      await reps.fill('10');
      await reps.dispatchEvent('change');
      await here.getByRole('button', { name: 'Log set 3', exact: true }).click();
      await page.waitForSelector('.hr-pr-banner');
    },
  });
  await shot(browser, 'exercise-card', '#/exercise/lat');
  await shot(browser, 'progress', '#/progress');
  await shot(browser, 'library', '#/library');
  await shot(browser, 'today-light', '#/', { theme: 'light' });
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
