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

// Logout may wipe this phone's copy only when nothing is waiting for the server.
export function canWipe(total) {
  return total === 0;
}
