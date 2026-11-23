// The README screenshots, in DEMO-DATA MODE ONLY (made-up program and history, never real data).
//
//   npm run screenshots        (builds into dist-test first, then writes docs/screenshots/*.webp)
//
// Serves the built app with `vite preview` (no API, so real data cannot appear) and drives an
// installed Edge or Chrome, headless, through scripts/browser.mjs; no browser download needed.
// The browser is closed and checked gone even if a shot fails. Each shot is the
// phone's size (360 x 780) at twice the pixels, saved as a 720 px wide WebP. The file names and
// scenes match the README table.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { closeBrowser, launchBrowser } from './browser.mjs';

const OUT = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}`;

// PNG -> WebP, encoded by the browser itself (no image library needed).
async function toWebp(browser, png) {
  const page = await browser.newPage();
  const data = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/webp', 0.9).split(',')[1];
  }, png.toString('base64'));
  await page.close();
  return Buffer.from(data, 'base64');
}

// Scrolls Today's or Progress's list so `selector` (or the element containing `text`) sits
// `offset` px below the top of the scrolling area; 'bottom' scrolls to the end.
async function scrollTo(page, { selector, text, offset = 16, bottom = false }) {
  await page.evaluate(
    ({ selector, text, offset, bottom }) => {
      const scroller = document.querySelector('.app__scroll');
      if (bottom) {
        scroller.scrollTop = scroller.scrollHeight;
        return;
      }
      const el = selector
        ? document.querySelector(selector)
        : [...scroller.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === text);
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTop = top - offset;
    },
    { selector, text, offset, bottom },
  );
}

// Swap Seated Cable Row for Chest-Supported Row from its row on Today.
async function swapRow(page) {
  await page.getByRole('button', { name: 'Swap Seated Cable Row' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Chest-Supported Row/ }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
}

// A fresh context per shot: empty IndexedDB, demo mode on, chosen theme and accent.
async function shot(browser, name, path, { theme = 'dark', accent = 'green', act } = {}) {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
  await context.addInitScript(
    ([t, a]) => {
      localStorage.setItem('hr-demo', '1');
      localStorage.setItem('hr-theme', t);
      localStorage.setItem('hr-accent', a);
    },
    [theme, accent],
  );
  const page = await context.newPage();
  const fail = [];
  page.on('pageerror', (e) => fail.push(e.message));
  page.on('request', (r) => r.url().includes('/api/') && fail.push(`API request in demo mode: ${r.url()}`));
  await page.goto(`${BASE}/${path}`);
  await page.waitForSelector('.app__scroll, .app__bar');
  if (act) await act(page);
  await page.waitForTimeout(500); // sheet and chart animations settle
  const png = await page.screenshot();
  await context.close();
  if (fail.length) throw new Error(`${name}: ${fail.join('; ')}`);
  writeFileSync(`${OUT}${name}.webp`, await toWebp(browser, png));
  console.log(`docs/screenshots/${name}.webp`);
}

mkdirSync(OUT, { recursive: true });
// dist-test/, never dist/: a screenshot build must not replace what the live server serves.
const server = await preview({ preview: { port: PORT, strictPort: true, host: '127.0.0.1' }, build: { outDir: 'dist-test' } });
let browser;
const plum = { theme: 'dark', accent: 'plum' };
const blue = { theme: 'light', accent: 'blue' };
try {
  browser = await launchBrowser();
  // Row 1: Dark theme, Plum (Toji) accent.
  await shot(browser, 'today-plum-dark', '#/', plum);
  await shot(browser, 'today-swaps', '#/', {
    ...plum,
    act: async (page) => {
      await swapRow(page);
      await scrollTo(page, { text: 'Chest-Supported Row', offset: 150 });
    },
  });
  // The swap sheet, opened from Seated Cable Row's page in the pager.
  await shot(browser, 'swap-sheet', '#/log/s3', {
    ...plum,
    act: async (page) => {
      await page.locator('.pager-page:not([inert])').getByRole('button', { name: 'Swap' }).click();
      await page.getByRole('dialog').waitFor();
    },
  });
  // Row 2: Light theme, Blue (Six Eyes) accent.
  await shot(browser, 'today-blue-light', '#/', blue);
  await shot(browser, 'today-alternatives', '#/', {
    ...blue,
    act: async (page) => {
      await swapRow(page);
      await scrollTo(page, { bottom: true });
    },
  });
  await shot(browser, 'library', '#/library', blue);
  // Row 3: Progress.
  await shot(browser, 'progress', '#/progress', blue);
  await shot(browser, 'progress-chart', '#/progress', {
    ...blue,
    act: (page) => scrollTo(page, { selector: '.period-title', offset: 12 }),
  });
  await shot(browser, 'progress-calendar', '#/progress', {
    ...blue,
    act: (page) => scrollTo(page, { selector: '.cal-head', offset: 56 }),
  });
} finally {
  try {
    await closeBrowser(browser);
  } finally {
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}
