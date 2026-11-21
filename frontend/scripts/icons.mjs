// App icon PNGs from the one source, public/icons/icon.svg (1024 x 1024, full-bleed background,
// artwork inside the maskable safe zone).
//
//   npm run icons        (writes public/icons/*.png)
//
// Renders with an installed Edge or Chrome through playwright-core; no browser download needed.
// The same full-bleed artwork serves "any" and "maskable": the background fills the square, and
// launchers that mask to a circle or squircle only trim background.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const DIR = fileURLToPath(new URL('../public/icons/', import.meta.url));
const svg = readFileSync(`${DIR}icon.svg`, 'utf8');

const OUTPUTS = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-192.png', 192],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
  ['favicon-16.png', 16],
];

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

const browser = await launch();
try {
  for (const [name, size] of OUTPUTS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    await page.setContent(
      `<html><body style="margin:0"><img src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`,
    );
    await page.locator('img').evaluate((img) => img.decode());
    await page.screenshot({ path: `${DIR}${name}`, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`public/icons/${name}`);
  }
} finally {
  await browser.close();
}
