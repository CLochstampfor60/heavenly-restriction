// One exercise's sessions, oldest first: made-up past sessions plus today's, once a set is logged.
import { HISTORY } from '../fixtures/history.js';
import { dateKey } from '../db.js';
import { day, e1rm } from './workout.svelte.js';

function todaySession(exerciseId) {
  const slots = day.order.map((id) => day.slots[id]).filter((s) => s.doneAs === exerciseId);
  const sets = [];
  let stop = null;
  for (const slot of slots) {
    for (const set of slot.sets) {
      if (set.status === 'done' || set.status === 'pr') sets.push({ w: set.w, r: set.r, stopped: false });
      if (set.status === 'stopped') {
        stop = { set: sets.length, symptom: set.symptom, w: set.w, r: null, note: set.note };
        sets.push({ w: set.w, r: null, stopped: true });
      }
    }
  }
  return sets.length ? { date: dateKey(), today: true, note: stop?.note ?? '', sets, stop } : null;
}

// Each session gets its top set (best est. 1RM among completed sets) and a PR flag. A session
// with a stop event is never a PR and does not move the running best.
export function sessionsFor(exerciseId) {
  const past = (HISTORY[exerciseId] ?? []).map((s) => ({
    date: s.date,
    today: false,
    note: s.note ?? '',
    sets: s.sets.map(([w, r], k) => ({ w, r, stopped: k === s.stop?.set })),
    stop: s.stop ? { ...s.stop, w: s.sets[s.stop.set][0], r: s.sets[s.stop.set][1] } : null,
  }));
  const today = todaySession(exerciseId);
  let best = 0;
  return [...past, ...(today ? [today] : [])].map((s, i) => {
    const done = s.sets.filter((x) => !x.stopped);
    const top = done.reduce((a, x) => (!a || e1rm(x.w, x.r) > e1rm(a.w, a.r) ? x : a), null);
    const e1 = top ? e1rm(top.w, top.r) : 0;
    const pr = !s.stop && i > 0 && e1 > best + 0.01;
    if (!s.stop) best = Math.max(best, e1);
    return { ...s, top, e1, pr };
  });
}

function parse(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// "Sat, Oct 17"
export function longDate(key) {
  return parse(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// "10/17"
export function shortDate(key) {
  const d = parse(key);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
