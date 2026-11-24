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
  assert.equal(await count(page), '2 of 7');
  const depth = await page.evaluate(() => history.length);

  await swipe(page, 300, 60); // left: next
  assert.equal(await count(page), '3 of 7');
  assert.equal(await hash(page), '#/log/s3');
  await swipe(page, 60, 300); // right: back
  assert.equal(await count(page), '2 of 7');
  // Page changes replace the history entry, so back still goes straight to Today.
  assert.equal(await page.evaluate(() => history.length), depth);

  // Arrows are the backup.
  await page.getByRole('button', { name: 'Next exercise' }).click();
  assert.equal(await count(page), '3 of 7');
  await page.getByRole('button', { name: 'Previous exercise' }).click();
  assert.equal(await count(page), '2 of 7');
  await context.close();
  assert.deepEqual(errors, []);
});

test('swipes do not start at the screen edges or on the steppers', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s3`);
  await swipe(page, 350, 100); // starts 10 px from the right edge
  assert.equal(await count(page), '3 of 7');
  await swipe(page, 10, 250); // starts 10 px from the left edge
  assert.equal(await count(page), '3 of 7');
  const box = await visible(page).locator('.hr-stepper').first().boundingBox();
  await swipe(page, box.x + box.width - 30, box.x - 100, box.y + box.height / 2);
  assert.equal(await count(page), '3 of 7');
  await context.close();
  assert.deepEqual(errors, []);
});

test('reduced motion: a swipe still turns the page', async () => {
  const { context, page, errors } = await phone({ reducedMotion: 'reduce' });
  await page.goto(`${BASE}/#/log/s3`);
  await swipe(page, 300, 60);
  assert.equal(await count(page), '4 of 7');
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
  assert.equal(await count(page), '3 of 7');
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
  assert.equal(await options.count(), 7); // six exercises and the cardio
  await options.nth(4).click();
  assert.equal(await count(page), '5 of 7');
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

// ---------- Skip (not Stop) ----------

const setsText = (p) => p.locator('.page-status .hr-num').innerText();

// Rows in an IndexedDB store of the demo database ('heavenly-restriction').
async function idbCount(page, store) {
  return page.evaluate(
    (name) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('heavenly-restriction');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction(name).objectStore(name).count();
          req.onsuccess = () => {
            resolve(req.result);
            open.result.close();
          };
        };
      }),
    store,
  );
}

test('Skip marks the exercise Skipped for today with no dialog and no stop event; Today says Skipped', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s3`);
  const p = visible(page);
  const stopsBefore = await idbCount(page, 'stops');
  await p.getByRole('button', { name: 'Skip exercise' }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  await p.locator('.hr-chip', { hasText: 'Skipped' }).waitFor();
  assert.equal(await p.locator('.hr-set--skipped').count(), 3);
  assert.equal(await idbCount(page, 'stops'), stopsBefore); // never a stop event
  await page.reload(); // saved at once, offline
  await page.waitForSelector('.pager-count');
  await visible(page).locator('.hr-chip', { hasText: 'Skipped' }).waitFor();
  await page.getByRole('link', { name: 'Today' }).click();
  const row = page.locator('.hr-exrow', { hasText: 'Seated Cable Row' });
  assert.match(await row.innerText(), /Skipped/);
  assert.doesNotMatch(await row.innerText(), /Stopped/);
  await context.close();
  assert.deepEqual(errors, []);
});

test('a Skipped exercise reopens by logging a set, or by Undo skip; logged sets stay through a skip', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s2`); // two of four logged in the demo
  const p = visible(page);
  await p.getByRole('button', { name: 'Skip exercise' }).click();
  assert.equal(await p.locator('.hr-set--done, .hr-set--pr').count(), 2);
  assert.equal(await p.locator('.hr-set--skipped').count(), 2);
  await p.getByRole('button', { name: 'Undo skip exercise' }).click();
  assert.equal(await p.locator('.hr-set--skipped').count(), 0);
  assert.equal(await setsText(p), '2 of 4 sets');
  await p.getByRole('button', { name: 'Skip exercise' }).click();
  await p.getByRole('button', { name: 'Log set 3', exact: true }).click(); // the existing rule
  assert.equal(await p.locator('.hr-chip', { hasText: 'Skipped' }).count(), 0);
  assert.equal(await setsText(p), '3 of 4 sets');
  await context.close();
  assert.deepEqual(errors, []);
});

// ---------- Swap sheet: no duplicates, All exercises ----------

const sheetNames = (page) => page.getByRole('dialog').locator('.option-name').allInnerTexts();

test('the swap sheet lists each exercise once, in its highest section', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s3`); // Single-Arm Cable Row is a substitution AND same muscle
  await visible(page).getByRole('button', { name: 'Swap' }).click();
  await page.getByRole('dialog').waitFor();
  const names = await sheetNames(page);
  assert.equal(names.filter((n) => n === 'Single-Arm Cable Row').length, 1);
  assert.equal(new Set(names).size, names.length, 'no name twice');
  // Kept in the highest section: under Your substitutions, before Same muscle.
  const text = (await page.getByRole('dialog').innerText()).toLowerCase();
  const at = text.indexOf('single-arm cable row');
  assert.ok(text.indexOf('your substitutions') < at && at < text.indexOf('same muscle'));
  await context.close();
  assert.deepEqual(errors, []);
});

test('All exercises: regions collapsed, search opens matches, excluded stay hidden, nothing listed twice', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s3`);
  await visible(page).getByRole('button', { name: 'Swap' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: /^Core/ }).waitFor();
  assert.equal(await sheet.getByRole('button', { name: /^Core/ }).getAttribute('aria-expanded'), 'false');
  await sheet.getByRole('button', { name: /^Core/ }).click();
  assert.match(await sheet.innerText(), /Dead Bug/);
  const names = await sheetNames(page);
  assert.equal(new Set(names).size, names.length, 'no name twice across all sections');
  assert.ok(!names.includes('Seated Cable Row'), 'not the exercise being swapped out');
  for (const hidden of ['upright', 'behind']) {
    await sheet.getByRole('searchbox', { name: 'Search all exercises' }).fill(hidden);
    assert.match(await sheet.innerText(), /No exercise matches/);
  }
  await sheet.getByRole('searchbox', { name: 'Search all exercises' }).fill('pallof');
  assert.deepEqual(await sheet.locator('section .option-name').allInnerTexts(), ['Pallof Press']);
  await context.close();
  assert.deepEqual(errors, []);
});

test('picking from All exercises swaps it in for today, logs under it, and survives a reload offline', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s3`);
  await visible(page).getByRole('button', { name: 'Swap' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('searchbox', { name: 'Search all exercises' }).fill('pushdown');
  await sheet.getByRole('button', { name: /Rope Pushdown/ }).click();
  await sheet.waitFor({ state: 'detached' });
  const p = visible(page);
  assert.match(await p.locator('h1').innerText(), /Rope Pushdown/);
  await p.getByRole('button', { name: 'Log set 1', exact: true }).click();
  await page.reload();
  await page.waitForSelector('.pager-count');
  assert.match(await visible(page).locator('h1').innerText(), /Rope Pushdown/);
  await page.getByRole('link', { name: 'Today' }).click();
  const row = page.locator('.hr-exrow', { hasText: 'Rope Pushdown' });
  assert.match(await row.innerText(), /Swapped from Seated Cable Row/);
  assert.match(await row.innerText(), /1 of 3 sets/);
  await context.close();
  assert.deepEqual(errors, []);
});

// ---------- Automatic workout timing ----------

// A fresh phone on a fake clock (so minutes can pass in an instant), demo data, offline.
async function phoneAt(time) {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 } });
  await context.addInitScript(() => localStorage.setItem('hr-demo', '1'));
  const page = await context.newPage();
  await page.clock.install({ time: new Date(time) });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => r.url().includes('/api/') && errors.push(`API request in demo mode: ${r.url()}`));
  await page.goto(`${BASE}/#/`);
  await page.waitForSelector('.app__bar');
  await context.setOffline(true);
  return { context, page, errors };
}

test('workout time is automatic: Today, Progress and the exercise card show it, offline and after a reload', async () => {
  const { context, page, errors } = await phoneAt('2026-11-23T18:00:00');
  await page.goto(`${BASE}/#/log/s3`);
  await visible(page).getByRole('button', { name: 'Log set 1', exact: true }).click();
  await page.clock.fastForward('20:00'); // 20 minutes later
  await visible(page).getByRole('button', { name: 'Log set 2', exact: true }).click();
  await page.getByRole('link', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finish' }).click();
  await page.locator('.workout-time').waitFor();
  assert.equal(await page.locator('.workout-time').innerText(), 'Workout time 20 min');
  await page.reload(); // saved with the session
  await page.waitForSelector('.app__bar');
  assert.equal(await page.locator('.workout-time').innerText(), 'Workout time 20 min');
  await page.goto(`${BASE}/#/progress`);
  const times = page.locator('section', { has: page.getByText(/Workout time/) });
  assert.match(await times.innerText(), /Today\s+20 min/);
  await page.goto(`${BASE}/#/exercise/row`);
  const today = page.locator('.session-row', { hasText: 'today' });
  assert.match(await today.innerText(), /20 min/); // Seated Cable Row: first to last set
  await context.close();
  assert.deepEqual(errors, []);
});

test('no time is shown until there is something to time', async () => {
  const { context, page, errors } = await phoneAt('2026-11-23T18:00:00');
  await page.goto(`${BASE}/#/progress`);
  assert.equal(await page.getByText(/Workout time/).count(), 0); // the demo's seeded sets carry no times
  await context.close();
  assert.deepEqual(errors, []);
});

// ---------- Cardio: what was actually done ----------

const stepperValue = (page, label) => page.getByRole('textbox', { name: new RegExp(`^${label}`) }).inputValue();

test('cardio: one tap on Done logs the values prefilled from the program; Today and a reload show them', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/cardio1`);
  const p = visible(page);
  assert.equal(await p.getByRole('button', { name: 'Incline walk', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await stepperValue(p, 'Minutes'), '20');
  assert.equal(await stepperValue(p, 'Incline'), '8');
  assert.equal(await stepperValue(p, 'Speed'), '3');
  assert.equal(await p.getByRole('textbox', { name: /^Level/ }).count(), 0); // a walk has no level
  await p.getByRole('button', { name: 'Done', exact: true }).click();
  await p.locator('.hr-chip--done').waitFor();
  assert.match(await p.innerText(), /20 min · incline 8 · 3 mph/);
  await page.reload();
  await page.waitForSelector('.pager-count');
  await visible(page).locator('.hr-chip--done').waitFor();
  await page.getByRole('link', { name: 'Today' }).click();
  assert.match(await page.locator('.hr-exrow', { hasText: 'Incline walk' }).innerText(), /20 min · incline 8 · 3 mph/);
  await context.close();
  assert.deepEqual(errors, []);
});

test('cardio: switch the type and adjust the steppers; a bike shows level, the values are kept offline', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/cardio1`);
  const p = visible(page);
  await p.getByRole('button', { name: 'Air bike', exact: true }).click();
  assert.equal(await p.getByRole('textbox', { name: /^Incline/ }).count(), 0);
  await p.getByRole('button', { name: 'More minutes' }).click();
  await p.getByRole('button', { name: 'More minutes' }).click();
  await p.getByRole('button', { name: 'More level' }).click(); // from empty: 1
  await p.getByRole('textbox', { name: /^Level/ }).fill('7');
  await p.getByRole('textbox', { name: /^Level/ }).press('Enter'); // a typed value counts too
  await p.getByRole('textbox', { name: /^Level/ }).blur();
  assert.equal(await stepperValue(p, 'Minutes'), '22');
  await p.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  await page.waitForSelector('.pager-count');
  assert.equal(await visible(page).getByRole('button', { name: 'Air bike', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await stepperValue(visible(page), 'Level'), '7');
  await page.getByRole('link', { name: 'Today' }).click();
  assert.match(await page.locator('.hr-exrow', { hasText: 'Incline walk' }).innerText(), /Air bike · 22 min · level 7/);
  await context.close();
  assert.deepEqual(errors, []);
});

test('cardio: Skip and Undo skip, with no dialog', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/cardio1`);
  const p = visible(page);
  await p.getByRole('button', { name: 'Skip Incline walk' }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  await p.locator('.hr-chip', { hasText: 'Skipped' }).waitFor();
  await p.getByRole('button', { name: 'Undo skip Incline walk' }).click();
  assert.match(await p.innerText(), /Not logged yet/);
  await context.close();
  assert.deepEqual(errors, []);
});

// ---------- Progress charts ----------

test('chart headline: the latest value until a point is tapped; the change line compares first to last', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/progress`);
  await page.getByRole('tab', { name: 'Weight' }).click();
  const value = page.locator('.readout__value');
  const detail = page.locator('.readout__detail');
  const change = page.locator('.readout__change');
  assert.match(await detail.innerText(), /^Latest · /);
  const latest = await value.innerText();
  const before = await change.innerText();
  assert.match(before, /^(▲ Up|▼ Down|No change)/);
  assert.match(before, /from first to last/);
  await page.locator('svg.hr-chart circle.chart-hit').first().click({ force: true });
  assert.match(await detail.innerText(), /^Selected · /);
  assert.notEqual(await value.innerText(), latest);
  assert.equal(await change.innerText(), before); // still first to last
  await context.close();
  assert.deepEqual(errors, []);
});

test('Your lifts: every lift in the period, most recent first; a row charts it and is remembered', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/progress`);
  await page.getByRole('tab', { name: 'Lift' }).click();
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  const rows = page.locator('.lift-row');
  const names = await rows.locator('.option-name').allInnerTexts();
  assert.equal(names[0], 'Assisted Pull-up'); // logged today in the demo
  assert.ok(names.includes('Lat Pulldown') && names.includes('Hammer Curl'));
  // The most recently logged lift is charted, and assistance says lower is better.
  assert.match(await page.locator('.chart-panel .hr-eyebrow').first().innerText(), /Assisted Pull-up/i);
  assert.match(await rows.first().innerText(), /lower is better/);
  const lat = rows.filter({ hasText: 'Lat Pulldown' });
  assert.match(await lat.innerText(), /▲ Up [\d.]+ lb/); // a word and an arrow, not color alone
  assert.match(await lat.innerText(), /PR/);
  assert.match(await lat.locator('svg.sparkline').getAttribute('aria-label'), /^Lat Pulldown: \d+ sessions, from/);
  await lat.click();
  assert.equal(await lat.getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('.chart-panel .hr-eyebrow').first().innerText(), /Lat Pulldown/i);
  assert.match(await page.locator('.readout__change').innerText(), /from first to last/);
  await page.reload(); // remembered on this device
  await page.getByRole('tab', { name: 'Lift' }).click();
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  assert.match(await page.locator('.chart-panel .hr-eyebrow').first().innerText(), /Lat Pulldown/i);
  await context.close();
  assert.deepEqual(errors, []);
});

test('% gain: up to five lines, labeled at their ends, rows add and remove them, kept after a reload', async () => {
  const { context, page, errors } = await phone();
  // Two more lifts today, so six are on record: one more than the chart can hold.
  for (const id of ['s4', 's6']) {
    await page.goto(`${BASE}/#/log/${id}`);
    await visible(page).getByRole('button', { name: 'Log set 1', exact: true }).click();
  }
  await page.goto(`${BASE}/#/progress`);
  await page.getByRole('tab', { name: 'Lift' }).click();
  await page.getByRole('button', { name: '% gain' }).click();
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  const lines = page.locator('svg.hr-chart path.ml-line');
  assert.equal(await page.locator('.lift-row').count(), 6);
  assert.equal(await lines.count(), 5); // the five most recently logged
  const labels = await page.locator('svg.hr-chart text.ml-name').allTextContents();
  assert.equal(labels.length, 5);
  assert.match((await page.locator('svg.hr-chart text.ml-value').allTextContents()).join(' '), /assist/); // inverted, labeled
  assert.equal(await page.locator('.legend').count(), 0);
  // The sixth cannot be added until one is removed.
  const off = page.locator('.lift-row[aria-pressed="false"]');
  assert.equal(await off.count(), 1);
  await off.click();
  assert.match(await page.getByRole('status').innerText(), /Up to 5 lines/);
  assert.equal(await lines.count(), 5);
  const first = page.locator('.lift-row[aria-pressed="true"]').first();
  const removed = await first.locator('.option-name').innerText();
  await first.click(); // remove
  assert.equal(await lines.count(), 4);
  await page.locator('.lift-row[aria-pressed="false"]').filter({ hasNotText: removed }).click(); // add the sixth
  assert.equal(await lines.count(), 5);
  await page.reload();
  await page.getByRole('tab', { name: 'Lift' }).click();
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '% gain' }).getAttribute('aria-pressed'), 'true'); // view kept
  assert.equal(await lines.count(), 5);
  const kept = await page.locator('.lift-row', { hasText: removed }).getAttribute('aria-pressed');
  assert.equal(kept, 'false'); // the choice kept too
  // Back to Pounds: one lift, the row tap charts it.
  await page.getByRole('button', { name: 'Pounds' }).click();
  assert.equal(await lines.count(), 0);
  assert.equal(await page.locator('svg.hr-chart path.hr-line').count(), 1);
  await context.close();
  assert.deepEqual(errors, []);
});

test('% gain: the last line cannot be removed', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/progress`);
  await page.getByRole('tab', { name: 'Lift' }).click();
  await page.getByRole('button', { name: '% gain' }).click();
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  const on = page.locator('.lift-row[aria-pressed="true"]');
  while ((await on.count()) > 1) await on.first().click();
  await on.first().click();
  assert.match(await page.getByRole('status').innerText(), /At least one lift/);
  assert.equal(await page.locator('svg.hr-chart path.ml-line').count(), 1);
  await context.close();
  assert.deepEqual(errors, []);
});

test('chart y-axes never go below 0', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/progress`);
  for (const tab of ['Weight', 'Lift']) {
    await page.getByRole('tab', { name: tab }).click();
    const yTicks = await page.locator('svg.hr-chart text.hr-axis[text-anchor="end"]').allTextContents();
    assert.ok(yTicks.length >= 2, `${tab}: has y ticks`);
    assert.ok(yTicks.every((t) => Number(t) >= 0), `${tab}: ${yTicks.join(', ')}`);
  }
  await context.close();
  assert.deepEqual(errors, []);
});

// ---------- Today's set count: + Add set / Remove set (all offline) ----------

test('+ Add set adds a prefilled set for today: one tap to add, one tap to log', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s3`);
  const p = visible(page);
  for (const k of [1, 2, 3]) await p.getByRole('button', { name: `Log set ${k}`, exact: true }).click();
  await p.locator('.hr-chip--done').waitFor();
  const add = p.getByRole('button', { name: 'Add set' });
  const box = await add.boundingBox();
  const row = await p.locator('.hr-set').first().boundingBox();
  assert.ok(box.height >= 44 && Math.abs(box.width - row.width) < 2, '44 px tall, full width');
  await add.click();
  assert.equal(await setsText(p), '3 of 4 sets');
  assert.equal(await p.locator('.hr-chip--done').count(), 0); // open again until it is logged
  // Prefilled from the set before it: the one-tap Log is ready, not "Enter weight".
  const log = p.getByRole('button', { name: 'Log set 4', exact: true });
  const set3 = await p.locator('.hr-set').nth(2).locator('.hr-set__v').first().innerText();
  assert.equal(await p.locator('.hr-set').nth(3).locator('.hr-set__v').first().innerText(), set3);
  await log.click();
  assert.equal(await setsText(p), '4 of 4 sets');
  await p.locator('.hr-chip--done').waitFor();
  await context.close();
  assert.deepEqual(errors, []);
});

test('Remove set N takes an unlogged set off today; logged sets have no remove; one set always stays', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s3`);
  const p = visible(page);
  await p.getByRole('button', { name: 'Log set 1', exact: true }).click();
  assert.equal(await p.getByRole('button', { name: 'Remove set 1' }).count(), 0); // logged: use undo
  await p.getByRole('button', { name: 'Remove set 3' }).click();
  assert.equal(await setsText(p), '1 of 2 sets');
  assert.equal(await p.locator('.hr-set').count(), 2);
  // Removing the last set still to do completes the exercise.
  await p.getByRole('button', { name: 'Remove set 2' }).click();
  assert.equal(await setsText(p), '1 of 1 sets');
  await p.locator('.hr-chip--done').waitFor();
  // Undo the logged set: one unlogged set is left, and it cannot be removed.
  await p.getByRole('button', { name: /^Set 1 done, tap to undo/ }).click();
  assert.equal(await p.locator('.hr-set').count(), 1);
  assert.equal(await p.getByRole('button', { name: /^Remove set/ }).count(), 0);
  await context.close();
  assert.deepEqual(errors, []);
});

test("today's set count shows on Today and the jump sheet, and survives a reload offline", async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s2`); // two of four sets logged in the demo
  const p = visible(page);
  await p.getByRole('button', { name: 'Remove set 4' }).click();
  await p.getByRole('button', { name: 'Remove set 3' }).click();
  await p.locator('.hr-chip--done').waitFor();
  await page.goto(`${BASE}/#/log/s5`);
  await visible(page).getByRole('button', { name: 'Add set' }).click();
  await page.reload(); // offline: from this device's copy
  await page.waitForSelector('.pager-count');
  assert.equal(await setsText(visible(page)), '0 of 4 sets');
  await page.getByRole('button', { name: /Show all exercises/ }).click();
  assert.match(await page.getByRole('dialog').innerText(), /0 of 4 sets|Not started/);
  await page.getByRole('link', { name: 'Today' }).click();
  const row = page.locator('.hr-exrow', { hasText: 'Lat Pulldown' });
  assert.match(await row.innerText(), /2 of 2 sets/);
  await row.locator('.exrow-open').click();
  await visible(page).locator('.hr-chip--done').waitFor();
  assert.equal(await page.locator('.pager-page:not([inert]) .hr-set').count(), 2);
  await context.close();
  assert.deepEqual(errors, []);
});

test("Finish workout uses today's count: an added set reopens a Done exercise, removed sets complete one", async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s1`); // all four sets logged in the demo
  const p = visible(page);
  await p.locator('.hr-chip--done').waitFor();
  await p.getByRole('button', { name: 'Add set' }).click();
  assert.equal(await setsText(p), '4 of 5 sets');
  await p.getByRole('button', { name: 'Log set 5', exact: true }).waitFor(); // a planned set, not "extra"
  await page.goto(`${BASE}/#/log/s2`); // two of four logged
  await visible(page).getByRole('button', { name: 'Remove set 4' }).click();
  await visible(page).getByRole('button', { name: 'Remove set 3' }).click();
  await page.getByRole('link', { name: 'Today' }).click();
  const pull = (await page.locator('.hr-exrow').first().innerText()).split('\n')[0];
  assert.match(await page.locator('.hr-exrow').first().innerText(), /4 of 5 sets/);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  const sheet = await page.getByRole('dialog').innerText();
  assert.ok(sheet.includes(pull), `${pull} is started and not done`);
  assert.doesNotMatch(sheet, /Lat Pulldown/); // done by its two remaining sets
  await context.close();
  assert.deepEqual(errors, []);
});

// ---------- Rest timer: Settings choice, Default rest, today's toggle (all offline) ----------

const timerShown = (page) => page.locator('.hr-timer, [role="timer"]').count();
const restMode = (page, name) => page.getByRole('radio', { name: new RegExp(`^${name}`) });

async function chooseRestMode(page, name) {
  await page.goto(`${BASE}/#/settings`);
  await restMode(page, name).click();
  assert.equal(await restMode(page, name).getAttribute('aria-checked'), 'true');
}

test('rest timer default is After every set: each set starts the countdown, the last one too', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/settings`);
  assert.equal(await restMode(page, 'After every set').getAttribute('aria-checked'), 'true');
  await page.goto(`${BASE}/#/log/s4`);
  const p = visible(page);
  await p.getByRole('button', { name: 'Log set 1', exact: true }).click();
  await p.getByRole('timer').waitFor();
  await p.getByRole('button', { name: 'Log set 2', exact: true }).click();
  await p.getByRole('button', { name: 'Log set 3', exact: true }).click(); // the last planned set
  await p.locator('.hr-chip--done').waitFor();
  await p.getByRole('timer').waitFor();
  await context.close();
  assert.deepEqual(errors, []);
});

test('rest timer Off: no countdown, pill or ring anywhere, and it stays off after a reload', async () => {
  const { context, page, errors } = await phone();
  // The demo starts mid-rest; choosing Off ends that countdown too.
  await chooseRestMode(page, 'Off');
  await page.goto(`${BASE}/#/log/s2`);
  await page.waitForSelector('.pager-count');
  assert.equal(await page.locator('.hr-timer').count(), 0);
  await visible(page).getByRole('button', { name: 'Log set 3', exact: true }).click();
  await swipe(page, 300, 60);
  await visible(page).getByRole('button', { name: 'Log set 1', exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(await timerShown(page), 0);
  assert.ok(await visible(page).getByRole('button', { name: 'Rest timer off' }).isVisible());
  await page.reload();
  await page.waitForSelector('.pager-count');
  await visible(page).getByRole('button', { name: 'Log set 2', exact: true }).click();
  assert.equal(await page.locator('.hr-timer').count(), 0);
  await page.goto(`${BASE}/#/settings`);
  assert.equal(await restMode(page, 'Off').getAttribute('aria-checked'), 'true');
  await context.close();
  assert.deepEqual(errors, []);
});

test('rest timer After each exercise: no countdown between sets, one after the last planned set', async () => {
  const { context, page, errors } = await phone();
  await chooseRestMode(page, 'After each exercise');
  await page.goto(`${BASE}/#/log/s4`);
  const p = visible(page);
  for (const k of [1, 2]) {
    await p.getByRole('button', { name: `Log set ${k}`, exact: true }).click();
    await page.waitForTimeout(200);
    assert.equal(await timerShown(page), 0, `no countdown after set ${k}`);
  }
  await p.getByRole('button', { name: 'Log set 3', exact: true }).click();
  await p.locator('.hr-chip--done').waitFor();
  await p.getByRole('timer').waitFor();
  assert.match(await p.locator('.hr-timer__label').innerText(), /1:00/); // s4's own rest from the program
  // Logging on the next exercise means the rest is over.
  await swipe(page, 300, 60);
  await visible(page).getByRole('button', { name: 'Log set 1', exact: true }).click();
  await page.waitForTimeout(200);
  assert.equal(await timerShown(page), 0);
  await context.close();
  assert.deepEqual(errors, []);
});

test('rest length: the program rest when given, else Default rest (15 s steps), kept after a reload', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/settings`);
  await page.getByRole('button', { name: /^Longer default rest/ }).click();
  await page.getByRole('button', { name: /^Longer default rest/ }).click(); // 90 -> 120 s
  assert.equal(await page.getByRole('textbox', { name: /^Default rest/ }).inputValue(), '120');
  await page.reload();
  await page.getByRole('textbox', { name: /^Default rest/ }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: /^Default rest/ }).inputValue(), '120');
  // s6 has no rest in the program: Default rest. s3 has 90 s in the program: that.
  await page.goto(`${BASE}/#/log/s6`);
  const p6 = visible(page);
  assert.match(await p6.locator('.hr-exh__meta').innerText(), /rest 2:00/);
  await p6.getByRole('button', { name: 'Log set 1', exact: true }).click();
  assert.match(await p6.locator('.hr-timer__label').innerText(), /2:00/);
  await p6.getByRole('button', { name: 'Add 15 seconds' }).click();
  await p6.getByRole('button', { name: 'Skip', exact: true }).click();
  assert.equal(await timerShown(page), 0);
  await page.goto(`${BASE}/#/log/s3`);
  assert.match(await visible(page).locator('.hr-exh__meta').innerText(), /rest 1:30/);
  await context.close();
  assert.deepEqual(errors, []);
});

test("the pager's timer button turns rest off for today only, without changing Settings", async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${BASE}/#/log/s3`);
  const toggle = visible(page).getByRole('button', { name: 'Rest timer on' });
  assert.match(await toggle.innerText(), /Timer on/);
  const box = await toggle.boundingBox();
  assert.ok(box.height >= 44 && box.width >= 44, '44 px target');
  await toggle.click(); // the demo's running countdown ends with it
  const off = visible(page).getByRole('button', { name: 'Rest timer off' });
  assert.match(await off.innerText(), /Timer off/);
  assert.equal(await timerShown(page), 0);
  await visible(page).getByRole('button', { name: 'Log set 1', exact: true }).click();
  await page.waitForTimeout(200);
  assert.equal(await timerShown(page), 0);
  // Every page shows today's state; Settings keeps its default.
  await swipe(page, 300, 60);
  assert.ok(await visible(page).getByRole('button', { name: 'Rest timer off' }).isVisible());
  await page.goto(`${BASE}/#/settings`);
  assert.equal(await restMode(page, 'After every set').getAttribute('aria-checked'), 'true');
  // Still off after a reload (offline): it is saved with today's session.
  await page.goto(`${BASE}/#/log/s3`);
  await page.reload();
  await page.waitForSelector('.pager-count');
  await visible(page).getByRole('button', { name: 'Rest timer off' }).click();
  await visible(page).getByRole('button', { name: 'Log set 2', exact: true }).click();
  await visible(page).getByRole('timer').waitFor();
  await context.close();
  assert.deepEqual(errors, []);
});

test('the timer button turns rest on for today when Settings says Off; choosing in Settings again resets today', async () => {
  const { context, page, errors } = await phone();
  await chooseRestMode(page, 'Off');
  await page.goto(`${BASE}/#/log/s3`);
  await visible(page).getByRole('button', { name: 'Rest timer off' }).click();
  await visible(page).getByRole('button', { name: 'Log set 1', exact: true }).click();
  await visible(page).getByRole('timer').waitFor(); // on today runs after every set
  await chooseRestMode(page, 'Off');
  await page.goto(`${BASE}/#/log/s3`);
  assert.ok(await visible(page).getByRole('button', { name: 'Rest timer off' }).isVisible());
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
