// App icon PNGs from the one source, design-system/assets/Brand/app-icon.svg (1024 x 1024,
// full-bleed background, artwork inside the maskable safe zone).
//
//   npm run icons        (writes public/icons/*.png; the SVG itself is not copied)
//
// Renders with an installed Edge or Chrome, headless, through scripts/browser.mjs; no browser
// download needed.
// The same full-bleed artwork serves "any" and "maskable": the background fills the square, and
// launchers that mask to a circle or squircle only trim background.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { closeBrowser, launchBrowser } from './browser.mjs';

const DIR = fileURLToPath(new URL('../public/icons/', import.meta.url));
const SOURCE = fileURLToPath(new URL('../../design-system/assets/Brand/app-icon.svg', import.meta.url));
const svg = readFileSync(SOURCE, 'utf8');

const OUTPUTS = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-192.png', 192],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
  ['favicon-16.png', 16],
];

const browser = await launchBrowser();
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
  await closeBrowser(browser);
}
