import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canWipe,
  deviceName,
  dragAxis,
  EDGE,
  finishMessage,
  finishPrompt,
  firstUnfinished,
  lastUsedText,
  nextSetIndex,
  openAtFinish,
  outboxDisposition,
  pageList,
  axisDomain,
  canRemoveSet,
  cardioDefaults,
  cardioText,
  cardioType,
  dedupeSwapGroups,
  libraryRegions,
  fitSets,
  formatDuration,
  sessionSeconds,
  spanSeconds,
  MIN_SETS,
  placeholderFor,
  queueCounts,
  readyToLog,
  reopenSets,
  saveStatus,
  statusAfterLog,
  swipeMayStart,
  swipeTarget,
  unstopSets,
} from '../src/logic.js';

test('first log of an exercise: no weight placeholder, reps from the plan', () => {
  const p = placeholderFor([], 0, null, 6);
  assert.equal(p.w, null);
  assert.equal(p.r, 6);
  assert.equal(readyToLog(p.w, p.r), false);
});

test('a typed weight makes the first log possible', () => {
  const p = placeholderFor([], 0, null, 6);
  assert.equal(readyToLog(45, p.r), true);
  assert.equal(readyToLog(0, p.r), true); // bodyweight is entered as 0
});

test('no plan range: reps must be entered too', () => {
  const p = placeholderFor([], 0, null, null);
  assert.equal(readyToLog(20, p.r), false);
});

test('second set of a first-time exercise carries the set just logged', () => {
  const p = placeholderFor([], 1, { w: 40, r: 8, s: null }, 6);
  assert.deepEqual(p, { w: 40, r: 8, s: null });
  assert.equal(readyToLog(p.w, p.r), true);
});

test('last session wins, by set number, last row repeated', () => {
  const last = [{ w: 100, r: 10 }, { w: 105, r: 9 }];
  assert.deepEqual(placeholderFor(last, 1, { w: 1, r: 1 }, 6), { w: 105, r: 9 });
  assert.deepEqual(placeholderFor(last, 3, null, 6), { w: 105, r: 9 });
});

test('an added set past last time carries the set just before it today', () => {
  const last = [{ w: 100, r: 10 }, { w: 105, r: 9 }];
  assert.deepEqual(placeholderFor(last, 2, { w: 110, r: 8, s: null }, 6), { w: 110, r: 8, s: null });
  assert.deepEqual(placeholderFor(last, 1, { w: 110, r: 8, s: null }, 6), { w: 105, r: 9 }); // same set number wins
});

const D = { status: 'done', w: 50, r: 10 };
const T = { status: 'todo' };

test('a set row can be removed only when unrecorded, nothing recorded after it, and one stays', () => {
  assert.equal(canRemoveSet([D, T, T], 1), true);
  assert.equal(canRemoveSet([D, T, T], 0), false); // logged: use undo
  assert.equal(canRemoveSet([T, D], 0), false); // a logged set after it would be renumbered
  assert.equal(canRemoveSet([{ status: 'stopped' }, T], 0), false);
  assert.equal(canRemoveSet([{ status: 'skipped' }, T], 1), true);
  assert.equal(canRemoveSet([T], 0), false);
  assert.equal(MIN_SETS, 1);
});

test("fitSets pads to today's count and drops only unrecorded rows past it", () => {
  assert.deepEqual(fitSets([D, T, T], 4), [D, T, T, T]);
  assert.deepEqual(fitSets([D, T, T], 2), [D, T]);
  assert.deepEqual(fitSets([D, D, D], 2), [D, D, D]); // logged extras stay
  assert.deepEqual(fitSets([D, T, T], 3), [D, T, T]);
});

test('queue counts split logged sets from other changes', () => {
  const entries = [{ kind: 'set' }, { kind: 'set' }, { kind: 'state' }, { kind: 'stop' }, { kind: 'set' }];
  assert.deepEqual(queueCounts(entries), { total: 5, sets: 3 });
  assert.deepEqual(queueCounts([]), { total: 0, sets: 0 });
});

test('save indicator: saved, waiting, offline', () => {
  assert.deepEqual(saveStatus({ total: 0, offline: true }), { state: 'saved', text: 'Saved' });
  assert.deepEqual(saveStatus({ total: 3, offline: false }), { state: 'waiting', text: '3 waiting to save' });
  assert.equal(saveStatus({ total: 1, offline: true }).text, 'Offline · 1 waiting to save');
});

test('finish message after a forced sync', () => {
  assert.equal(finishMessage({ total: 0, sets: 0, offline: false }), 'All sets saved to server');
  assert.equal(
    finishMessage({ total: 4, sets: 3, offline: true }),
    "Offline: 3 sets and 1 other change waiting to save. They send automatically when you're back online.",
  );
  assert.equal(
    finishMessage({ total: 1, sets: 1, offline: true }),
    "Offline: 1 set waiting to save. It sends automatically when you're back online.",
  );
  assert.match(finishMessage({ total: 2, sets: 0, offline: false }), /^2 changes waiting/);
});

test('logout wipes only an empty queue', () => {
  assert.equal(canWipe(0), true);
  assert.equal(canWipe(1), false);
});

test('outbox: 401 pauses for sign-in and keeps the change', () => {
  assert.equal(outboxDisposition(401), 'auth');
});

test('outbox: network errors and server trouble retry, bad requests drop', () => {
  for (const s of [null, undefined, 500, 503, 403, 408, 429]) assert.equal(outboxDisposition(s), 'retry', String(s));
  for (const s of [400, 404, 409, 422]) assert.equal(outboxDisposition(s), 'drop', String(s));
});

// ---------- Finish workout with exercises still open ----------

const row = (id, status, extra = {}) => ({ id, status, optional: false, loggable: true, logged: 0, ...extra });

test('finish: untouched required exercises are skipped, logged ones keep their sets', () => {
  const open = openAtFinish([
    row('a', 'done', { logged: 3 }),
    row('b', 'active', { logged: 2 }),
    row('c', 'todo'),
    row('d', 'stopped', { logged: 1 }),
    row('e', 'skipped'),
    row('f', 'todo'),
  ]);
  assert.deepEqual(open, { skip: ['c', 'f'], end: ['b'], reset: [] });
});

test('finish: optional and checklist items are never marked missed', () => {
  const open = openAtFinish([
    row('wu', 'todo', { loggable: false }),
    row('opt', 'todo', { optional: true }),
    row('opt2', 'active', { optional: true }),
    row('opt3', 'active', { optional: true, logged: 1 }),
  ]);
  assert.deepEqual(open, { skip: [], end: ['opt3'], reset: ['opt2'] });
});

test('finish prompt: none when nothing is open, so Finish needs no confirm', () => {
  assert.equal(finishPrompt({ skip: [], end: [], reset: ['x'] }), null);
});

test('finish prompt wording', () => {
  assert.deepEqual(finishPrompt({ skip: ['a', 'b', 'c'], end: [] }), {
    title: '3 exercises not done',
    question: 'Mark them Skipped and finish?',
    keeps: null,
  });
  assert.equal(finishPrompt({ skip: ['a'], end: [] }).question, 'Mark it Skipped and finish?');
  const mixed = finishPrompt({ skip: ['a'], end: ['b'] }, ['Lat Pulldown']);
  assert.equal(mixed.title, '2 exercises not done');
  assert.equal(mixed.keeps, 'Lat Pulldown keeps its logged sets; the rest of its sets are skipped.');
  assert.equal(finishPrompt({ skip: [], end: ['b'] }, ['Lat Pulldown']).question, 'Finish now?');
});

// ---------- Passkeys ----------

test('device names from the user agent', () => {
  const s23 = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
  assert.equal(deviceName(s23), 'Android phone');
  assert.equal(deviceName(win), 'Windows (Windows Hello)');
  assert.equal(deviceName(''), 'Passkey');
});

test('last used wording', () => {
  const now = new Date(2026, 10, 20, 18, 0);
  assert.equal(lastUsedText(null, now), 'Not used to sign in yet');
  assert.equal(lastUsedText(new Date(2026, 10, 20, 7, 5).toISOString(), now), 'Last used today');
  assert.equal(lastUsedText(new Date(2026, 10, 19, 23, 0).toISOString(), now), 'Last used yesterday');
  assert.equal(lastUsedText(new Date(2026, 10, 3, 9, 0).toISOString(), now), 'Last used Nov 3');
  assert.equal(lastUsedText(new Date(2025, 11, 30, 9, 0).toISOString(), now), 'Last used Dec 30, 2025');
});

// ---------- Set slots in any order ----------

const S = (...statuses) => statuses.map((status) => ({ status }));

test('the next set fills the first planned set left, else adds an extra one', () => {
  assert.equal(nextSetIndex(S('todo', 'todo')), 0);
  assert.equal(nextSetIndex(S('done', 'todo', 'todo')), 1);
  assert.equal(nextSetIndex(S('done', 'pr', 'done')), 3); // all planned sets logged: extra set
  assert.equal(nextSetIndex([]), 0);
});

test('an exercise is Done once no planned set is left to do', () => {
  assert.equal(statusAfterLog(S('done', 'todo')), 'active');
  assert.equal(statusAfterLog(S('done', 'pr')), 'done');
  assert.equal(statusAfterLog(S('done', 'done', 'done')), 'done'); // with an extra set
});

// ---------- Pager ----------

test('pages follow Today: cardio after the forearm block, before the cool-down and Later', () => {
  const rows = [
    { id: 'WU', block: 'warmup' },
    { id: '1', block: 'main' },
    { id: 'F1', block: 'forearm' },
    { id: 'CD', block: 'cooldown' },
    { id: '2', block: 'main', later: true },
  ];
  const ids = pageList(rows, [{ id: 'cardio1' }, { id: 'cardio2' }]).map((p) => p.id);
  assert.deepEqual(ids, ['WU', '1', 'F1', 'cardio1', 'cardio2', 'CD', '2']);
  assert.deepEqual(pageList(rows.slice(0, 3), [{ id: 'cardio1' }]).map((p) => p.id), ['WU', '1', 'F1', 'cardio1']);
  assert.equal(pageList(rows, [{ id: 'cardio1' }])[3].kind, 'cardio');
});

test('Start / Continue opens at the first required page not ended', () => {
  const P = (status, optional = false) => ({ status, optional });
  assert.equal(firstUnfinished([P('done'), P('stopped'), P('todo', true), P('active'), P('todo')]), 3);
  assert.equal(firstUnfinished([P('done'), P('todo', true)]), 1); // only optional work left
  assert.equal(firstUnfinished([P('done'), P('skipped')]), 0); // all ended
});

test('swipes never start at the screen edges (Android back gesture)', () => {
  assert.equal(EDGE, 24);
  assert.equal(swipeMayStart(10, 360), false);
  assert.equal(swipeMayStart(23, 360), false);
  assert.equal(swipeMayStart(24, 360), true);
  assert.equal(swipeMayStart(200, 360), true);
  assert.equal(swipeMayStart(340, 360), false);
});

test('a drag is a swipe only when it is mostly sideways', () => {
  assert.equal(dragAxis(4, 3), null); // still within the slop
  assert.equal(dragAxis(30, 5), 'x');
  assert.equal(dragAxis(5, 30), 'y');
  assert.equal(dragAxis(20, 20), 'y'); // diagonal: leave it to scrolling
});

test('a quarter of the width or a flick turns the page, never past the ends', () => {
  assert.equal(swipeTarget(3, 10, -100, 360), 4);
  assert.equal(swipeTarget(3, 10, 100, 360), 2);
  assert.equal(swipeTarget(3, 10, -60, 360), 3); // short and slow: springs back
  assert.equal(swipeTarget(3, 10, -60, 360, -0.8), 4); // short and quick: a flick
  assert.equal(swipeTarget(0, 10, 200, 360), 0);
  assert.equal(swipeTarget(9, 10, -200, 360), 9);
});

// ---------- No state locks logging ----------

test('logging into a stopped or skipped exercise reopens its skipped sets; the stop stays', () => {
  const sets = [{ status: 'done' }, { status: 'stopped', symptom: 'Pinch' }, { status: 'skipped' }, { status: 'skipped' }];
  const open = reopenSets(sets);
  assert.deepEqual(open.map((s) => s.status), ['done', 'stopped', 'todo', 'todo']);
  assert.equal(nextSetIndex(open), 2);
  // "Finish after 2 sets" then one more: it fills the planned third set.
  assert.equal(nextSetIndex(reopenSets(S('done', 'done', 'skipped'))), 2);
});

test('Undo stop: the stopped set and the skipped ones after it are to do again', () => {
  const sets = [{ status: 'done' }, { status: 'stopped' }, { status: 'skipped' }];
  assert.deepEqual(unstopSets(sets, 3).map((s) => s.status), ['done', 'todo', 'todo']);
  assert.equal(statusAfterLog(unstopSets(sets, 3)), 'active');
  // A stop on the very first set with nothing logged (a false stop): back to untouched.
  assert.deepEqual(unstopSets([{ status: 'stopped' }, { status: 'skipped' }], 2).map((s) => s.status), ['todo', 'todo']);
  // A stop on an extra set: the extra row goes away.
  assert.deepEqual(unstopSets(S('done', 'done', 'stopped'), 2).map((s) => s.status), ['done', 'done']);
});

test('swap sheet: each exercise once, in its highest section; the current and excluded ones never', () => {
  const lib = { 1: {}, 2: {}, 3: {}, 4: { excluded: { kind: 'goal' } }, 5: {} };
  const known = (id) => lib[id];
  const groups = [
    { label: 'Your substitutions', ids: [2, 3] },
    { label: 'Same muscle', ids: [3, 4, 1, 5, 9] }, // 3 is a substitution already (the Side Plank case)
  ];
  assert.deepEqual(dedupeSwapGroups(groups, 1, known), [
    { label: 'Your substitutions', ids: [2, 3] },
    { label: 'Same muscle', ids: [5] },
  ]);
  assert.deepEqual(dedupeSwapGroups([{ label: 'Same muscle', ids: [1] }], 1, known), []); // empty sections go
});

test('All exercises: by region, minus listed and excluded, every search word must match', () => {
  const rows = [
    { id: 1, name: 'Side Plank', regionName: 'Core' },
    { id: 2, name: 'Dead Bug', regionName: 'Core' },
    { id: 3, name: 'Machine Row', regionName: 'Back' },
    { id: 4, name: 'Upright Row', regionName: 'Shoulders', excluded: { kind: 'joint' } },
    { id: 5, name: 'Cable Row', regionName: 'Back' },
  ];
  const all = libraryRegions(rows, new Set(['1']));
  assert.deepEqual(all.map((r) => [r.name, r.rows.map((x) => x.id)]), [['Back', [5, 3]], ['Core', [2]]]);
  assert.deepEqual(libraryRegions(rows, new Set(), 'row ca').map((r) => r.rows.map((x) => x.id)), [[5]]);
  assert.deepEqual(libraryRegions(rows, new Set(), 'upright'), []); // excluded stays hidden
});

test('workout timing: Start or first set, to Finish or last set; exercise: first to last set', () => {
  const t = (min) => new Date(Date.UTC(2026, 10, 23, 18, min)).toISOString();
  const times = [t(5), t(20), t(50)];
  assert.equal(sessionSeconds({ startedAt: t(0), finishedAt: t(60), finished: true, times }), 3600);
  assert.equal(sessionSeconds({ startedAt: null, finishedAt: null, finished: false, times }), 45 * 60);
  assert.equal(sessionSeconds({ startedAt: t(10), finishedAt: null, finished: false, times }), 45 * 60);
  assert.equal(sessionSeconds({ startedAt: null, finishedAt: t(59), finished: false, times }), 45 * 60);
  assert.equal(sessionSeconds({ startedAt: t(0), finishedAt: null, finished: false, times: [] }), null);
  assert.equal(spanSeconds([t(5), t(17)]), 12 * 60);
  assert.equal(spanSeconds([t(5)]), null);
  assert.equal(formatDuration(null), '');
  assert.equal(formatDuration(30), 'under 1 min');
  assert.equal(formatDuration(52 * 60 + 40), '52 min');
  assert.equal(formatDuration(65 * 60), '1 h 05 min');
});

test('cardio: type from the program wording, prefilled from the program, one line of text', () => {
  assert.equal(cardioType('Air Bike'), 'air_bike');
  assert.equal(cardioType('Incline Treadmill Walk'), 'incline_walk');
  assert.equal(cardioType('Walk'), 'incline_walk');
  assert.equal(cardioType('Stationary bike'), 'bike');
  assert.equal(cardioType('Stair climber'), 'stair_climber');
  const walk = cardioDefaults({ mode: 'Incline walk', minutesMin: 20, settings: { incline: 8, speed_mph: 3 } });
  assert.deepEqual(walk, { type: 'incline_walk', minutes: 20, incline: 8, mph: 3, level: null });
  assert.equal(cardioText(walk), '20 min · incline 8 · 3 mph');
  // A bike shows its level, not the walk's incline and speed.
  assert.equal(cardioText({ ...walk, type: 'air_bike', level: 7 }), '20 min · level 7');
});

test('chart axis: data range plus ~10%, never below 0, two to four round ticks inside', () => {
  const a = axisDomain([150, 186.7]);
  assert.ok(Math.abs(a.lo - (150 - 3.67)) < 0.01 && Math.abs(a.hi - (186.7 + 3.67)) < 0.01);
  assert.ok(a.ticks.length >= 2 && a.ticks.length <= 4);
  assert.ok(a.ticks.every((t) => t >= a.lo && t <= a.hi));
  assert.equal(axisDomain([0, 10]).lo, 0); // padding never goes below 0
  assert.equal(axisDomain([9.5, 196.3]).lo, 0);
  assert.ok(axisDomain([-12, 8], { floor0: false }).lo < -12); // % change may go negative
  const flat = axisDomain([100, 100]);
  assert.ok(flat.lo < 100 && flat.hi > 100);
});
