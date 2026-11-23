// End-to-end checks of the exercise pager, in DEMO-DATA MODE ONLY (made-up program, no API).
//
//   npm run test:e2e        (builds first; needs Microsoft Edge or Google Chrome installed)
//
// Serves the built app with `vite preview` and drives the installed browser through
// playwright-core at the phone's size (360 x 780). The network is cut before the pager opens,
// so every swipe and log below happens offline.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const PORT = 4175;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let browser;

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

before(async () => {
  server = await preview({ preview: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'silent' });
  browser = await launch();
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
});

// A fresh phone: empty IndexedDB, demo mode, the demo's mid-workout start (Lat Pulldown two
// sets in). Fails the test on any page error or any /api/ request.
async function phone({ reducedMotion = 'no-preference', prefs } = {}) {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, hasTouch: false });
  await context.addInitScript(() => localStorage.setItem('hr-demo', '1'));
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => r.url().includes('/api/') && errors.push(`API request in demo mode: ${r.url()}`));
  await page.goto(`${BASE}/#/`);
  await page.waitForSelector('.app__bar');
  if (prefs) await prefs(page);
  await context.setOffline(true);
  return { context, page, errors };
}

const count = (page) => page.locator('.pager-count').innerText();
const hash = (page) => page.evaluate(() => location.hash);
const visible = (page) => page.locator('.pager-page:not([inert])');

// Drags across the current page body with the mouse (pointer events), from x0 to x1.
async function swipe(page, x0, x1, y = 420) {
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(x0 + ((x1 - x0) * k) / 8, y);
  await page.mouse.up();
  await page.waitForTimeout(300); // the 200 ms settle
}

test('Continue opens the pager at the first unfinished exercise; swipes move pages offline', async () => {
  const { context, page, errors } = await phone();
  await page.getByRole('button', { name: /^Continue: Lat Pulldown/ }).click();
  assert.equal(await hash(page), '#/log/s2');
  assert.equal(await count(page), '2 of 6');
  const depth = await page.evaluate(() => history.length);

  await swipe(page, 300, 60); // left: next
  assert.equal(await count(page), '3 of 6');
  assert.equal(await hash(page), '#/log/s3');
  await swipe(page, 60, 300); // right: back
  assert.equal(await count(page), '2 of 6');
  // Page changes replace the history entry, so back still goes straight to Today.
  assert.equal(await page.evaluate(() => history.length), depth);

  // Arrows are the backup.
  await page.getByRole('button', { name: 'Next exercise' }).click();
  assert.equal(await count(page), '3 of 6');
  await page.getByRole('button', { name: 'Previous exercise' }).click();
  assert.equal(await count(page), '2 of 6');
  await context.close();
  assert.deepEqual(errors, []);
});

test('swipes do not start at the screen edges or on the steppers', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s3`);
  await swipe(page, 350, 100); // starts 10 px from the right edge
  assert.equal(await count(page), '3 of 6');
  await swipe(page, 10, 250); // starts 10 px from the left edge
  assert.equal(await count(page), '3 of 6');
  const box = await visible(page).locator('.hr-stepper').first().boundingBox();
  await swipe(page, box.x + box.width - 30, box.x - 100, box.y + box.height / 2);
  assert.equal(await count(page), '3 of 6');
  await context.close();
  assert.deepEqual(errors, []);
});

test('reduced motion: a swipe still turns the page', async () => {
  const { context, page, errors } = await phone({ reducedMotion: 'reduce' });
  await page.goto(`${BASE}/#/log/s3`);
  await swipe(page, 300, 60);
  assert.equal(await count(page), '4 of 6');
  await context.close();
  assert.deepEqual(errors, []);
});

test('one tap logs the prefilled set, in any order; Today shows progress', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s5`); // jump ahead: Hammer Curl before Seated Cable Row
  await visible(page).getByRole('button', { name: 'Log set 1', exact: true }).click();
  await visible(page).locator('.hr-set--done').first().waitFor();
  await swipe(page, 60, 300);
  await swipe(page, 60, 300);
  assert.equal(await count(page), '3 of 6');
  await visible(page).getByRole('button', { name: 'Log set 1', exact: true }).click();
  await page.getByRole('link', { name: 'Today' }).click();
  assert.equal(await hash(page), '#/');
  const row = (name) => page.locator('.hr-exrow', { hasText: name });
  assert.match(await row('Hammer Curl').innerText(), /1 of 3 sets/);
  assert.match(await row('Seated Cable Row').innerText(), /1 of 3 sets/);
  await context.close();
  assert.deepEqual(errors, []);
});

test('a Done exercise takes extra sets and stays Done', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s1`); // all four sets logged in the demo
  const p = visible(page);
  await p.locator('.hr-chip--done').waitFor();
  await p.getByRole('button', { name: 'Log extra set 5', exact: true }).click();
  assert.equal(await p.locator('.hr-set--done, .hr-set--pr').count(), 5);
  await p.locator('.hr-chip--done').waitFor();
  await context.close();
  assert.deepEqual(errors, []);
});

test('the last planned set marks the exercise Done', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s4`);
  const p = visible(page);
  for (const k of [1, 2, 3]) await p.getByRole('button', { name: `Log set ${k}`, exact: true }).click();
  await p.locator('.hr-chip--done').waitFor();
  await context.close();
  assert.deepEqual(errors, []);
});

test('Home and the back gesture return to Today from anywhere, keeping logged sets', async () => {
  const { context, page, errors } = await phone();
  await page.getByRole('button', { name: /^Continue/ }).click();
  await visible(page).getByRole('button', { name: 'Log set 3', exact: true }).click(); // rest timer now running
  await page.getByRole('button', { name: /Show all exercises/ }).click(); // jump sheet open
  await page.getByRole('dialog').waitFor();
  await page.getByRole('link', { name: 'Today' }).click();
  assert.equal(await hash(page), '#/');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.match(await page.locator('.hr-exrow', { hasText: 'Lat Pulldown' }).innerText(), /3 of 4 sets/);

  // Back gesture (browser back) with the swap sheet open.
  await page.locator('.hr-exrow', { hasText: 'Seated Cable Row' }).locator('.exrow-open').click();
  assert.equal(await hash(page), '#/log/s3');
  await visible(page).getByRole('button', { name: 'Swap' }).click();
  await page.getByRole('dialog').waitFor();
  await page.goBack();
  assert.equal(await hash(page), '#/');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await context.close();
  assert.deepEqual(errors, []);
});

test('the jump sheet lists every page and jumps', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s1`);
  await page.getByRole('button', { name: /Show all exercises/ }).click();
  const options = page.getByRole('dialog').locator('.hr-sheet__option');
  assert.equal(await options.count(), 6);
  await options.nth(4).click();
  assert.equal(await count(page), '5 of 6');
  await context.close();
  assert.deepEqual(errors, []);
});
