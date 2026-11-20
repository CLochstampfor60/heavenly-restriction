// Personal-record rules. Mirrors backend/app/prs.py; change both together.
//  - The first time an exercise is logged is a baseline, never a PR.
//  - Weighted reps: estimated 1RM (Epley) above the best before it.
//  - Bodyweight reps (no load): more reps than ever before at no load.
//  - Assisted (w is the assistance): lower is progress. Needs the slot's minimum reps, and no
//    earlier set may have done as many reps or more with the same or less assistance.
//  - Timed: no earlier set may have held as long or longer with the same or more load.
// Sets are { w, r, s } (weight lb, reps, seconds).

export function e1rm(w, r) {
  return w * (1 + r / 30);
}

export function isPr(set, prior, { assisted = false, measure = 'reps', repFloor = null } = {}) {
  if (!prior.length) return false;
  const w = set.w ?? 0;
  if (measure === 'seconds') {
    if (set.s == null) return false;
    return !prior.some((p) => (p.s ?? 0) >= set.s && (p.w ?? 0) >= w);
  }
  if (set.r == null) return false;
  if (assisted) {
    if (repFloor != null && set.r < repFloor) return false;
    return !prior.some((p) => (p.r ?? 0) >= set.r && (p.w ?? 0) <= w);
  }
  if (w <= 0) {
    const unloaded = prior.filter((p) => !p.w).map((p) => p.r ?? 0);
    return unloaded.length > 0 && set.r > Math.max(...unloaded);
  }
  const best = Math.max(0, ...prior.map((p) => e1rm(p.w ?? 0, p.r ?? 0)));
  return e1rm(w, set.r) > best + 0.01;
}

// The set that represents a session: lowest assistance, longest hold, or best est. 1RM.
export function topSet(sets, { assisted = false, measure = 'reps' } = {}) {
  let top = null;
  for (const x of sets) {
    if (!top) top = x;
    else if (measure === 'seconds') {
      if ((x.s ?? 0) > (top.s ?? 0) || ((x.s ?? 0) === (top.s ?? 0) && (x.w ?? 0) > (top.w ?? 0))) top = x;
    } else if (assisted) {
      if ((x.w ?? 0) < (top.w ?? 0) || ((x.w ?? 0) === (top.w ?? 0) && (x.r ?? 0) > (top.r ?? 0))) top = x;
    } else if (!x.w && !top.w) {
      if ((x.r ?? 0) > (top.r ?? 0)) top = x;
    } else if (e1rm(x.w ?? 0, x.r ?? 0) > e1rm(top.w ?? 0, top.r ?? 0)) top = x;
  }
  return top;
}
