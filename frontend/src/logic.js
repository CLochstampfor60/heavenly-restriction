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
