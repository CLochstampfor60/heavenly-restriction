import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canWipe,
  finishMessage,
  finishPrompt,
  openAtFinish,
  outboxDisposition,
  placeholderFor,
  queueCounts,
  readyToLog,
  saveStatus,
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
