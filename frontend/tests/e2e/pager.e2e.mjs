// End-to-end checks of the exercise pager, in DEMO-DATA MODE ONLY (made-up program, no API).
//
//   npm run test:e2e        (builds first; needs Microsoft Edge or Google Chrome installed)
//
// Builds into dist-test/ (never dist/, which the live server serves to the phone), serves it
// with `vite preview` and drives the installed browser, headless, through scripts/browser.mjs at
// the phone's size (360 x 780). The network is cut before the pager opens, so every swipe and
// log below happens offline. Teardown closes every context and the browser even when a test
// fails, and fails the run if any browser process is left behind.
import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { preview } from 'vite';
import { closeBrowser, launchBrowser } from '../../scripts/browser.mjs';

const PORT = 4175;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let browser;

before(async () => {
  // mode 'demo': the preview has no /api proxy at all, so nothing can reach the live server.
  server = await preview({
    mode: 'demo',
    preview: { port: PORT, strictPort: true, host: '127.0.0.1' },
    build: { outDir: 'dist-test' },
    logLevel: 'silent',
  });
  browser = await launchBrowser();
});

// A failed assertion skips the test's own context.close(); close whatever it left open.
afterEach(async () => {
  for (const context of browser?.contexts() ?? []) await context.close().catch(() => {});
});

after(async () => {
  try {
    await closeBrowser(browser);
  } finally {
    if (server) await new Promise((resolve) => server.httpServer.close(resolve));
  }
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

// ---------- No exercise state locks logging ----------

async function stopHere(page, symptom = 'Pinch') {
  await visible(page).getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: symptom, exact: true }).click();
  await page.getByRole('button', { name: 'Stop and record' }).click();
}

test('a stopped exercise can still be logged, which reopens it; the stop survives a reload', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s3`);
  await visible(page).getByRole('button', { name: 'Log set 1', exact: true }).click();
  await stopHere(page);
  const p = visible(page);
  await p.locator('.hr-chip--stopped').waitFor();
  await p.getByRole('button', { name: 'Log set 3', exact: true }).click(); // set 2 is the stopped one
  assert.equal(await p.locator('.hr-chip--stopped').count(), 0);
  assert.match(await p.innerText(), /2 of 3 sets/);
  await page.reload();
  await page.waitForSelector('.pager-count');
  const q = visible(page);
  assert.equal(await q.locator('.hr-set--stopped').count(), 1);
  assert.equal(await q.locator('.hr-set--done, .hr-set--pr').count(), 2);
  assert.equal(await q.locator('.hr-chip--stopped').count(), 0);
  await context.close();
  assert.deepEqual(errors, []);
});

test('Undo stop on Today removes a false stop everywhere, and after a reload', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s3`);
  await stopHere(page, 'Other'); // stopped only to move on, nothing logged
  await page.getByRole('link', { name: 'Today' }).click();
  const row = page.locator('.hr-exrow', { hasText: 'Seated Cable Row' });
  assert.match(await row.innerText(), /Stopped · Other/);
  await row.getByRole('button', { name: 'Undo stop' }).click();
  assert.doesNotMatch(await row.innerText(), /Stopped/);
  await page.reload();
  await page.waitForSelector('.app__bar');
  assert.doesNotMatch(await page.locator('.hr-exrow', { hasText: 'Seated Cable Row' }).innerText(), /Stopped/);
  await page.locator('.hr-exrow', { hasText: 'Seated Cable Row' }).locator('.exrow-open').click();
  const p = visible(page);
  assert.equal(await p.locator('.hr-set--stopped').count(), 0);
  await p.getByRole('button', { name: 'Log set 1', exact: true }).waitFor();
  await context.close();
  assert.deepEqual(errors, []);
});

test('Undo stop on the exercise page reopens it with its logged sets', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s2`); // two sets logged in the demo
  await stopHere(page);
  const p = visible(page);
  await p.getByRole('button', { name: 'Undo stop' }).click();
  assert.equal(await p.locator('.hr-set--stopped, .hr-set--skipped').count(), 0);
  assert.equal(await p.locator('.hr-set--done, .hr-set--pr').count(), 2);
  await p.getByRole('button', { name: 'Log set 3', exact: true }).waitFor();
  await context.close();
  assert.deepEqual(errors, []);
});

test('a Skipped exercise (after Finish workout) can be logged, which reopens it and the workout', async () => {
  const { context, page, errors } = await phone();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finish' }).click();
  await page.getByText('Workout finished').or(page.getByText('Demo data')).first().waitFor();
  const row = page.locator('.hr-exrow', { hasText: 'Hammer Curl' });
  await row.locator('.exrow-open').click();
  const p = visible(page);
  await p.getByText('Skipped', { exact: true }).first().waitFor();
  await p.getByRole('button', { name: 'Log set 1', exact: true }).click();
  assert.equal(await p.locator('.hr-set--skipped').count(), 0);
  await page.getByRole('link', { name: 'Today' }).click();
  assert.match(await page.locator('.hr-exrow', { hasText: 'Hammer Curl' }).innerText(), /1 of 3 sets/);
  await page.getByRole('button', { name: /^Continue/ }).waitFor(); // the workout is open again
  await context.close();
  assert.deepEqual(errors, []);
});

test('a Swapped exercise logs under the exercise actually done', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s3`);
  await visible(page).getByRole('button', { name: 'Swap' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Chest-Supported Row/ }).click();
  const p = visible(page);
  assert.match(await p.locator('h1').innerText(), /Chest-Supported Row/);
  await p.getByRole('button', { name: 'Log set 1', exact: true }).click();
  await page.getByRole('link', { name: 'Today' }).click();
  const row = page.locator('.hr-exrow', { hasText: 'Chest-Supported Row' });
  assert.match(await row.innerText(), /Swapped from Seated Cable Row/);
  assert.match(await row.innerText(), /1 of 3 sets/);
  await context.close();
  assert.deepEqual(errors, []);
});

// ---------- Rest timer setting ----------

test('rest timer on (the default): logging a set starts the countdown', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/settings`);
  assert.equal(await page.getByRole('switch', { name: /Rest timer/ }).getAttribute('aria-checked'), 'true');
  await page.goto(`${BASE}/#/log/s3`);
  await visible(page).getByRole('button', { name: 'Log set 1', exact: true }).click();
  await visible(page).getByRole('timer').waitFor();
  await context.close();
  assert.deepEqual(errors, []);
});

test('rest timer off: no countdown, pill or ring anywhere, and it stays off after a reload', async () => {
  const { context, page, errors } = await phone();
  // The demo starts mid-rest; turning the timer off ends that countdown too.
  await page.goto(`${BASE}/#/settings`);
  const toggle = page.getByRole('switch', { name: /Rest timer/ });
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-checked'), 'false');
  await page.goto(`${BASE}/#/log/s2`);
  await page.waitForSelector('.pager-count');
  assert.equal(await page.locator('.hr-timer').count(), 0);
  await visible(page).getByRole('button', { name: 'Log set 3', exact: true }).click();
  await swipe(page, 300, 60);
  await visible(page).getByRole('button', { name: 'Log set 1', exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.hr-timer, [role="timer"]').count(), 0);
  await page.reload();
  await page.waitForSelector('.pager-count');
  await visible(page).getByRole('button', { name: 'Log set 2', exact: true }).click();
  assert.equal(await page.locator('.hr-timer').count(), 0);
  await page.goto(`${BASE}/#/settings`);
  assert.equal(await page.getByRole('switch', { name: /Rest timer/ }).getAttribute('aria-checked'), 'false');
  await context.close();
  assert.deepEqual(errors, []);
});

test('a stopped exercise never shows an ended state: Undo stop and logging are both there', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s3`);
  await stopHere(page);
  await page.reload(); // as the phone opens it later
  await page.waitForSelector('.pager-count');
  const p = visible(page);
  assert.doesNotMatch(await page.locator('body').innerText(), /has ended/i);
  await p.getByRole('button', { name: 'Undo stop' }).waitFor();
  await p.getByRole('button', { name: 'Log set 2', exact: true }).waitFor();
  assert.equal(await p.locator('.hr-stepper').count(), 2);
  await context.close();
  assert.deepEqual(errors, []);
});

test('Settings > About shows the version and the build commit', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/settings`);
  assert.match(await page.locator('.about-card').innerText(), /Heavenly Restriction \d+\.\d+\.\d+ · build [0-9a-f]{7,}(\+changes)? · MIT License/);
  await context.close();
  assert.deepEqual(errors, []);
});
