// One exercise's sessions, oldest first: past sessions plus today's, once a set is logged.
import { dateKey } from '../db.js';
import { e1rm, isPr, topSet } from '../prs.js';
import { isDeleted } from './deleted.svelte.js';
import { CATALOG, HISTORY } from './source.svelte.js';
import { day, exerciseSecondsToday } from './workout.svelte.js';

function todaySession(exerciseId) {
  // Route ids are strings; API ids are numbers.
  const slots = day.order.map((id) => day.slots[id]).filter((s) => s.doneAs != null && String(s.doneAs) === String(exerciseId));
  const sets = [];
  let stop = null;
  for (const slot of slots) {
    for (const set of slot.sets) {
      if (set.status === 'done' || set.status === 'pr') {
        sets.push({ w: set.w, r: set.r, s: set.s, stopped: false });
      }
      if (set.status === 'stopped') {
        stop = { set: sets.length, symptom: set.symptom, w: set.w, r: null, note: set.note };
        sets.push({ w: set.w, r: null, s: null, stopped: true });
      }
    }
  }
  return sets.length
    ? { date: dateKey(), today: true, note: stop?.note ?? '', sets, stop, duration: exerciseSecondsToday(exerciseId) }
    : null;
}

// How a session is charted: est. 1RM for weighted reps; assistance for assisted exercises
// (lower is better); seconds for timed holds; reps for bodyweight.
export function chartRule(ex) {
  if (ex?.measure === 'seconds') return { key: 'seconds', label: 'Longest hold', unit: 's', e1: false };
  if (ex?.assisted) return { key: 'assist', label: 'Least assistance', unit: 'lb', e1: false };
  return { key: 'reps', label: 'Top set', unit: 'lb', e1: true };
}

// Each session gets its top set and a PR flag. A session with a stop event is never a PR and
// does not move the running best.
// Sets are [w, r, s, id]: id is the server's client_id (demo history: a stable made-up one).
// Sets deleted from history are left out, so PRs and charts are worked out without them; a
// session with nothing left drops out. withToday adds today's live session (this phone's copy).
export function sessionsFor(exerciseId, history = HISTORY, catalog = CATALOG, withToday = history === HISTORY) {
  const ex = catalog[exerciseId] ?? {};
  const rule = { assisted: !!ex.assisted, measure: ex.measure ?? 'reps' };
  const past = (history[exerciseId] ?? [])
    .map((s) => {
      const sets = s.sets
        .map(([w, r, sec, id], k) => ({
          w,
          r,
          s: sec ?? null,
          id: id ?? `${exerciseId}|${s.date}|${k}`,
          stopped: k === s.stop?.set,
        }))
        .filter((x) => x.stopped || !isDeleted(x.id));
      return {
        date: s.date,
        today: false,
        note: s.note ?? '',
        duration: s.duration ?? null, // this exercise's time that session: first to last set
        sets,
        stop: s.stop ? { ...s.stop, w: s.sets[s.stop.set]?.[0], r: s.sets[s.stop.set]?.[1] } : null,
      };
    })
    .filter((s) => s.sets.length);
  const today = withToday ? todaySession(exerciseId) : null;
  let prior = [];
  return [...past, ...(today ? [today] : [])].map((s) => {
    const done = s.sets.filter((x) => !x.stopped);
    const top = topSet(done, rule);
    let e1 = 0;
    if (top) {
      if (rule.measure === 'seconds') e1 = top.s ?? 0;
      else if (rule.assisted) e1 = top.w ?? 0;
      else e1 = top.w ? e1rm(top.w, top.r ?? 0) : (top.r ?? 0);
    }
    const pr = !s.stop && !!top && isPr(top, prior, rule);
    if (!s.stop) prior = prior.concat(done);
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
