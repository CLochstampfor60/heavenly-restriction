import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeholderFor, readyToLog } from '../src/logic.js';

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
