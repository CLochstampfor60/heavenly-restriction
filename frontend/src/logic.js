// Pure set-logging rules, kept free of Svelte so `npm test` (node --test) can check them.

// What a set row offers before you touch it: last session's values for the same set number;
// on the first ever log, the set just logged today in this slot; failing both, no weight at
// all (it must be entered) and the low end of the plan's range for reps or seconds.
export function placeholderFor(last, k, earlier, targetMin) {
  if (last?.length) return last[Math.min(k, last.length - 1)];
  if (earlier) return { w: earlier.w, r: earlier.r, s: earlier.s };
  return { w: null, r: targetMin ?? null, s: targetMin ?? null };
}

// The one-tap log needs a weight (typed, or carried from a placeholder) and a count.
export function readyToLog(weight, count) {
  return weight != null && !Number.isNaN(weight) && count != null && !Number.isNaN(count);
}

// ---------- Save status (the outbox of changes waiting for the server) ----------

// Outbox entries -> counts. Only `set` entries are logged sets; the rest are session state,
// stops, undos, cardio ticks and measurements.
export function queueCounts(entries) {
  return { total: entries.length, sets: entries.filter((e) => e.kind === 'set').length };
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// The small indicator on Today and Set logging.
export function saveStatus({ total, offline }) {
  if (!total) return { state: 'saved', text: 'Saved' };
  return { state: offline ? 'offline' : 'waiting', text: `${offline ? 'Offline · ' : ''}${total} waiting to save` };
}

// What "Finish workout" reports after forcing a sync.
export function finishMessage({ total, sets, offline }) {
  if (!total) return 'All sets saved to server';
  const what = sets ? `${plural(sets, 'set')}${total > sets ? ` and ${plural(total - sets, 'other change')}` : ''}` : plural(total, 'change');
  return `${offline ? 'Offline: ' : ''}${what} waiting to save. ${total === 1 ? 'It sends' : 'They send'} automatically when you're back online.`;
}

// ---------- Finish workout with exercises still open ----------

const ENDED = ['done', 'stopped', 'skipped'];

// What Finish does to each loggable slot that has not ended. `slots` are plain rows:
// { id, status, optional, loggable, logged } where logged is the number of sets logged.
// - skip: required exercises with nothing logged become Skipped.
// - end: any exercise with sets logged keeps them; its remaining sets are skipped (as with
//   "Finish after N sets").
// - reset: an optional exercise opened but not logged goes back to to-do (optional work never
//   counts as missed).
export function openAtFinish(slots) {
  const out = { skip: [], end: [], reset: [] };
  for (const s of slots) {
    if (!s.loggable || ENDED.includes(s.status)) continue;
    if (s.logged) out.end.push(s.id);
    else if (!s.optional) out.skip.push(s.id);
    else if (s.status === 'active') out.reset.push(s.id);
  }
  return out;
}

// The confirm sheet's wording, or null when nothing is open and Finish needs no confirm.
// `partial` names the exercises that keep their logged sets.
export function finishPrompt({ skip, end }, partial = []) {
  const open = skip.length + end.length;
  if (!open) return null;
  const title = `${plural(open, 'exercise')} not done`;
  let question = 'Mark them Skipped and finish?';
  if (open === 1) question = 'Mark it Skipped and finish?';
  if (!skip.length) question = 'Finish now?';
  const keeps = partial.length
    ? `${partial.join(', ')} ${partial.length === 1 ? 'keeps its' : 'keep their'} logged sets; the rest of ${partial.length === 1 ? 'its' : 'their'} sets are skipped.`
    : null;
  return { title, question, keeps };
}

// Logout may wipe this phone's copy only when nothing is waiting for the server.
export function canWipe(total) {
  return total === 0;
}

// What the outbox does with a failed send. 401: keep everything and pause until sign-in
// (sync waits for login). Network errors, 5xx, 403, 408, 429: keep and retry later. Other
// 4xx: the server will never accept it, so drop it.
export function outboxDisposition(status) {
  if (status == null) return 'retry';
  if (status === 401) return 'auth';
  if (status >= 500 || status === 403 || status === 408 || status === 429) return 'retry';
  return 'drop';
}
