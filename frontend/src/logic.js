// Pure set-logging rules, kept free of Svelte so `npm test` (node --test) can check them.

// What a set row offers before you touch it: last session's values for the same set number;
// for a set number last time did not reach (an added or extra set) or on the first ever log,
// the set just logged before it today in this slot, else last time's final set; failing all,
// no weight at all (it must be entered) and the low end of the plan's range for reps or seconds.
export function placeholderFor(last, k, earlier, targetMin) {
  if (last?.length && k < last.length) return last[k];
  if (earlier) return { w: earlier.w, r: earlier.r, s: earlier.s };
  if (last?.length) return last[last.length - 1];
  return { w: null, r: targetMin ?? null, s: targetMin ?? null };
}

// The one-tap log needs a weight (typed, or carried from a placeholder) and a count.
export function readyToLog(weight, count) {
  return weight != null && !Number.isNaN(weight) && count != null && !Number.isNaN(count);
}

// ---------- Set slots: any order, extra sets allowed ----------

const LOGGED = ['done', 'pr'];

export function isLogged(set) {
  return LOGGED.includes(set.status);
}

// Where the next set goes: the first planned set still to do, or a new extra set at the end.
export function nextSetIndex(sets) {
  const k = sets.findIndex((s) => s.status === 'todo');
  return k === -1 ? sets.length : k;
}

// Workouts are never linear: logging works whatever state an exercise is in. Logging into an
// ended exercise reopens it, so sets that Stop, Finish or "Finish after N sets" skipped are to
// do again. A stopped set stays where it was.
export function reopenSets(sets) {
  return sets.map((s) => (s.status === 'skipped' ? { status: 'todo' } : s));
}

// Undo stop: the stopped set is to do again (an extra one is dropped), and so are the skipped
// sets after it.
export function unstopSets(sets, planned) {
  const out = [];
  sets.forEach((s, k) => {
    if (s.status === 'stopped') {
      if (k < planned) out.push({ status: 'todo' });
    } else out.push(s.status === 'skipped' ? { status: 'todo' } : s);
  });
  return out;
}

// An exercise is Done once no planned set is left to do; extra sets after that keep it Done.
// ---------- Today's set count: "+ Add set" and "Remove set" ----------

export const MIN_SETS = 1;
const RECORDED = ['done', 'pr', 'stopped'];

// A set row can be removed when nothing is recorded on it (to do, or skipped), nothing recorded
// comes after it (so no logged set changes its number), and at least MIN_SETS rows stay.
export function canRemoveSet(sets, k) {
  if (sets.length <= MIN_SETS) return false;
  if (RECORDED.includes(sets[k]?.status)) return false;
  return !sets.slice(k + 1).some((s) => RECORDED.includes(s.status));
}

// The set rows for today's planned count: to-do rows added up to it, and unrecorded rows past it
// dropped (recorded rows always stay, as extra sets).
export function fitSets(sets, planned) {
  const out = [...sets];
  while (out.length > planned && !RECORDED.includes(out[out.length - 1].status)) out.pop();
  while (out.length < planned) out.push({ status: 'todo' });
  return out;
}

export function statusAfterLog(sets) {
  return sets.some((s) => s.status === 'todo') ? 'active' : 'done';
}

// ---------- Exercise pager ----------

// The pager's pages in Today's order: each slot of day.order, with the cardio entries placed
// after the forearm block, before the cool-down and anything moved to Later (as Today shows it).
// `rows`: [{ id, block, later }] in day.order; `cardio`: [{ id }].
export function pageList(rows, cardio = []) {
  const out = [];
  let placed = !cardio.length;
  const place = () => {
    if (!placed) out.push(...cardio.map((c) => ({ kind: 'cardio', id: c.id })));
    placed = true;
  };
  for (const r of rows) {
    if (r.later || r.block === 'cooldown') place();
    out.push({ kind: 'slot', id: r.id });
  }
  place();
  return out;
}

const ENDED_PAGE = ['done', 'stopped', 'skipped'];

// Where Start workout / Continue opens: the first required page not yet ended, else the first
// optional one, else the first page. `pages`: [{ status, optional }].
export function firstUnfinished(pages) {
  const open = (p) => !ENDED_PAGE.includes(p.status);
  const k = pages.findIndex((p) => open(p) && !p.optional);
  if (k !== -1) return k;
  return Math.max(0, pages.findIndex(open));
}

// Swipes never start within EDGE px of the screen's sides (Android's back gesture lives there).
export const EDGE = 24;
const SLOP = 10;

export function swipeMayStart(x, width) {
  return x >= EDGE && x <= width - EDGE;
}

// Which way a drag is going once it has moved past the slop: 'x', 'y', or null (not yet).
export function dragAxis(dx, dy) {
  if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return null;
  return Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
}

// The page a released swipe lands on: a quarter of the width, or a quick flick, turns the page.
// dx > 0 is a drag to the right (back one page). `velocity` is px per ms.
export function swipeTarget(index, count, dx, width, velocity = 0) {
  const far = Math.abs(dx) > width / 4;
  const flick = Math.abs(dx) > 30 && Math.abs(velocity) > 0.4;
  if (!far && !flick) return index;
  const next = dx < 0 ? index + 1 : index - 1;
  return Math.min(count - 1, Math.max(0, next));
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

// ---------- Passkeys ----------

// A starting name for a new passkey, from the browser's user agent. Renamable in Settings.
export function deviceName(ua = '') {
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android phone' : 'Android tablet';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Windows/i.test(ua)) return 'Windows (Windows Hello)';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux computer';
  return 'Passkey';
}

// "Last used" on a passkey row. Dates are compared in local time.
export function lastUsedText(iso, now = new Date()) {
  if (!iso) return 'Not used to sign in yet';
  const d = new Date(iso);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000);
  if (days <= 0) return 'Last used today';
  if (days === 1) return 'Last used yesterday';
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return `Last used ${d.toLocaleDateString('en-US', opts)}`;
}

// ---------- Swap sheet ----------

// Sections in order (highest first). An exercise is listed once, in the first section it belongs
// to; the exercise being swapped out, excluded ones and unknown ones are never listed.
// groups: [{ label, ids }]; known(id) -> the exercise or undefined.
export function dedupeSwapGroups(groups, current, known) {
  const seen = new Set([String(current)]);
  const out = [];
  for (const g of groups) {
    const ids = [];
    for (const id of g.ids) {
      const key = String(id);
      const ex = known(id);
      if (seen.has(key) || !ex || ex.excluded) continue;
      seen.add(key);
      ids.push(id);
    }
    if (ids.length) out.push({ label: g.label, ids });
  }
  return out;
}

// "All exercises": the library minus excluded ones and anything already listed, matched by every
// word of the query (case-insensitive), grouped by region in name order.
// rows: [{ id, name, regionName, excluded }]; listed: Set of ids as strings.
export function libraryRegions(rows, listed, query = '') {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const byRegion = new Map();
  for (const r of rows) {
    if (r.excluded || listed.has(String(r.id))) continue;
    const name = r.name.toLowerCase();
    if (!words.every((w) => name.includes(w))) continue;
    const region = r.regionName || 'Other';
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region).push(r);
  }
  return [...byRegion.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, list]) => ({ name, rows: list.sort((a, b) => a.name.localeCompare(b.name)) }));
}

// ---------- Workout timing (from timestamps; nothing is entered) ----------
// Same rules as the server (backend/app/timing.py). Times are ISO strings or Dates.

const ms = (t) => (t == null ? null : new Date(t).getTime());

// First to last of two or more times, in whole seconds.
export function spanSeconds(times) {
  const list = times.map(ms).filter((t) => t != null && !Number.isNaN(t));
  if (list.length < 2) return null;
  return Math.floor((Math.max(...list) - Math.min(...list)) / 1000);
}

// Start workout or the first logged set, whichever came first, to Finish workout (when finished)
// or the last logged set.
export function sessionSeconds({ startedAt, finishedAt, finished, times }) {
  const sets = times.map(ms).filter((t) => t != null && !Number.isNaN(t));
  const starts = [ms(startedAt), ...sets].filter((t) => t != null);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  let end = null;
  if (finished && finishedAt) end = ms(finishedAt);
  else if (sets.length) end = Math.max(...sets);
  if (end == null || end <= start) return null;
  return Math.floor((end - start) / 1000);
}

// "under 1 min", "52 min", "1 h 05 min"; '' when unknown.
export function formatDuration(seconds) {
  if (seconds == null) return '';
  const min = Math.floor(seconds / 60);
  if (min < 1) return 'under 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

// ---------- Cardio: what was actually done ----------

// The type switch, and the fields each type shows (minutes always; incline and speed for the
// walk; level or resistance for bikes and the stair climber).
export const CARDIO_TYPES = [
  { id: 'bike', label: 'Bike', fields: ['minutes', 'level'] },
  { id: 'air_bike', label: 'Air bike', fields: ['minutes', 'level'] },
  { id: 'incline_walk', label: 'Incline walk', fields: ['minutes', 'incline', 'mph'] },
  { id: 'stair_climber', label: 'Stair climber', fields: ['minutes', 'level'] },
];

// The program's wording -> a type: "Air bike" -> air_bike, "Incline Treadmill Walk" ->
// incline_walk, "Walk" -> incline_walk.
export function cardioType(mode = '') {
  const m = mode.toLowerCase();
  if (m.includes('stair')) return 'stair_climber'; // before "air": "stair" contains it
  if (/\bair\b/.test(m)) return 'air_bike';
  if (m.includes('bike') || m.includes('cycle')) return 'bike';
  return 'incline_walk';
}

// What a cardio page starts with: the program's minutes (the low end of a range), incline and
// speed; no level (the program gives none). One tap on Done logs exactly this.
export function cardioDefaults({ mode, minutesMin, settings = {} }) {
  return {
    type: cardioType(mode),
    minutes: minutesMin ?? null,
    incline: settings.incline ?? null,
    mph: settings.speed_mph ?? null,
    level: null,
  };
}

// One line for Today and the page: "20 min · incline 8 · 3 mph", "10 min · level 7".
export function cardioText(log) {
  const type = CARDIO_TYPES.find((t) => t.id === log.type) ?? CARDIO_TYPES[2];
  const parts = [];
  if (log.minutes != null) parts.push(`${log.minutes} min`);
  if (type.fields.includes('incline') && log.incline != null) parts.push(`incline ${log.incline}`);
  if (type.fields.includes('mph') && log.mph != null) parts.push(`${log.mph} mph`);
  if (type.fields.includes('level') && log.level != null) parts.push(`level ${log.level}`);
  return parts.join(' · ');
}

// ---------- Chart axis ----------

// A line chart's y domain: the data's range with ~10% padding on each side, never below 0 when
// floor0 (weights, reps, seconds); ticks on round numbers inside the domain (two to four).
export function axisDomain(values, { floor0 = true, pad = 0.1 } = {}) {
  const vals = values.filter((v) => Number.isFinite(v));
  if (!vals.length) return { lo: 0, hi: 1, ticks: [0, 1] };
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const span = hi - lo;
  const p = span ? span * pad : Math.max(Math.abs(hi) * pad, 1);
  lo -= p;
  hi += p;
  if (floor0 && lo < 0) lo = 0;
  let step = 0;
  let ticks = [];
  for (const parts of [3, 6]) {
    const raw = (hi - lo) / parts;
    const mag = 10 ** Math.floor(Math.log10(raw));
    step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw);
    ticks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
    if (ticks.length >= 2) break;
  }
  return { lo, hi, ticks };
}

// ---------- Lift tab: periods, "Your lifts", % gain ----------
// sessions: one exercise's sessions oldest first, as history.sessionsFor gives them
// ({ date, e1, pr, stop, top }); e1 is the session's value by the exercise's rule (est. 1RM,
// assistance, seconds or reps).

const dayKey = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.toISOString().slice(0, 10);
};

// Month: this calendar month. Year: the 12 months up to today.
export function inPeriod(date, range, todayKey) {
  if (date > todayKey) return false;
  if (range === 'month') return date.slice(0, 7) === todayKey.slice(0, 7);
  const [y, m, d] = todayKey.split('-').map(Number);
  return date > dayKey(y - 1, m, d);
}

// One "Your lifts" row: the period's points (sessions with a value; a stop is not one), first,
// latest, change, whether it holds a new best (PR), and when it was last logged.
export function liftRow(sessions, range, todayKey) {
  const inside = sessions.filter((s) => inPeriod(s.date, range, todayKey));
  if (!inside.length) return null;
  const points = inside.filter((s) => !s.stop && s.top).map((s) => ({ date: s.date, value: s.e1, pr: !!s.pr }));
  const first = points[0]?.value ?? null;
  const latest = points.at(-1)?.value ?? null;
  return {
    points,
    first,
    latest,
    change: points.length >= 2 ? latest - first : null,
    pr: points.some((p) => p.pr),
    lastDate: inside.at(-1).date,
  };
}

// Most recently logged first; then by name.
export function sortLifts(rows) {
  return [...rows].sort((a, b) => (a.lastDate === b.lastDate ? a.name.localeCompare(b.name) : a.lastDate < b.lastDate ? 1 : -1));
}


// ---------- Body regions (the Library and Progress › Lift, same order) ----------

export const REGIONS = ['Back', 'Core', 'Chest', 'Shoulders', 'Arms', 'Legs', 'Hips', 'Other'];

// Rows grouped by region in REGIONS order (an unknown region counts as Other); rows keep their
// order. rows: [{ region, ... }] -> [{ name, rows }]
export function groupByRegion(rows) {
  const known = (r) => (REGIONS.includes(r) ? r : 'Other');
  return REGIONS.map((name) => ({ name, rows: rows.filter((r) => known(r.region) === name) })).filter((g) => g.rows.length);
}

// Regions open at first: every region holding a PR in the period, and the region of the most
// recently logged lift. rows: most recent first, each { region, row: { pr } }.
export function openRegions(rows) {
  const open = new Set(rows.filter((r) => r.row.pr).map((r) => (REGIONS.includes(r.region) ? r.region : 'Other')));
  if (rows.length) open.add(REGIONS.includes(rows[0].region) ? rows[0].region : 'Other');
  return open;
}

// The Lift tab's summary for the period, in words: "3 PRs · 5 improving · 2 flat", plus
// "· 1 down" only when a lift got worse. Improving / flat / down compare first to last (for
// assisted lifts less assistance is better); a lift with one session is in none of them.
// rows: [{ assisted, row: { pr, change } }]
export function liftSummary(rows) {
  const n = { prs: 0, improving: 0, flat: 0, down: 0 };
  for (const r of rows) {
    if (r.row.pr) n.prs += 1;
    if (r.row.change == null) continue;
    const better = r.assisted ? -r.row.change : r.row.change;
    if (Math.abs(better) < 0.05) n.flat += 1;
    else if (better > 0) n.improving += 1;
    else n.down += 1;
  }
  const parts = [`${n.prs} PR${n.prs === 1 ? '' : 's'}`, `${n.improving} improving`, `${n.flat} flat`];
  if (n.down) parts.push(`${n.down} down`);
  return { ...n, text: parts.join(' · ') };
}
