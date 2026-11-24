// Today's session. The program comes from stores/source (API or demo fixtures); what happens
// in the session (sets, stops, swaps, order, gear, checklist and cardio ticks) is kept in
// IndexedDB so a reload resumes where it left off, and in real mode is queued to the server.
import { tick } from 'svelte';
import { db, dateKey } from '../db.js';
import { DEMO_SESSION, GEAR } from '../fixtures/demo.js';
import {
  canRemoveSet,
  dedupeSwapGroups,
  firstUnfinished,
  fitSets,
  isLogged,
  nextSetIndex,
  openAtFinish,
  pageList,
  placeholderFor,
  reopenSets,
  statusAfterLog,
  unstopSets,
} from '../logic.js';
import { e1rm, isPr } from '../prs.js';
import { prefs } from './prefs.svelte.js';
import {
  BLOCKS,
  CATALOG,
  catalogFromLibrary,
  ensureExercise,
  HISTORY,
  loadLibrary,
  loadSource,
  PROGRAM,
  source,
} from './source.svelte.js';
import { enqueue, onResult, startSync, syncNow } from './sync.svelte.js';

export { e1rm };

const today = dateKey();
const ENDED = ['done', 'stopped', 'skipped'];

// restToday: the pager's rest timer toggle for today only ('on' | 'off'), or null to follow
// Settings > Workout > Rest timer.
export const day = $state({ order: [], slots: {}, cardio: [], gear: {}, gearOpen: false, finished: false, restToday: null });
export const rest = $state({ running: false, endsAt: 0, total: 0, now: Date.now(), buzzed: false });
export const ui = $state({ swapFor: null, banner: null });

function blankDay() {
  const slots = {};
  for (const p of PROGRAM.slots) {
    slots[p.id] = {
      id: p.id,
      exerciseId: p.exercise,
      plan: { ...p },
      status: 'todo',
      swappedTo: null,
      // The exercise actually done; fixed once the first set is logged.
      doneAs: null,
      later: false,
      // Today's planned set count after "+ Add set" / "Remove set"; null = the program's.
      planned: null,
      sets: Array.from({ length: p.loggable ? p.sets : 0 }, () => ({ status: 'todo' })),
    };
  }
  return {
    name: PROGRAM.name,
    version: PROGRAM.version,
    programKey: `${PROGRAM.version}/${PROGRAM.dayKey ?? PROGRAM.name}`,
    order: PROGRAM.slots.map((p) => p.id),
    slots,
    cardio: PROGRAM.cardio.map((c) => ({ ...c, status: 'todo' })),
    gear: Object.fromEntries(GEAR.map((g) => [g, false])),
    gearOpen: false,
    finished: false,
    restToday: null,
  };
}

// First visit of the day in demo mode: start mid-workout, as in the design.
function applyDemoSeed() {
  for (const [id, status] of Object.entries(DEMO_SESSION.status)) day.slots[id].status = status;
  for (const [id, logged] of Object.entries(DEMO_SESSION.logged)) {
    const slot = day.slots[id];
    slot.doneAs = slot.exerciseId;
    logged.forEach((set, k) => {
      slot.sets[k] = { ...set, rir: null, status: 'done' };
    });
  }
  Object.assign(day.gear, DEMO_SESSION.gear);
  const resting = Object.keys(DEMO_SESSION.status).find((id) => DEMO_SESSION.status[id] === 'active');
  if (resting && DEMO_SESSION.restLeft) {
    startRest(restFor(day.slots[resting]));
    rest.endsAt = Date.now() + DEMO_SESSION.restLeft * 1000;
  }
}

// ---------- Persistence ----------

const setId = (slotId, k) => `${today}/${slotId}/${k}`;
const path = (rest = '') => `/api/sessions/${today}${rest}`;

function warn(error) {
  console.warn('Could not save to this device; the session will not survive a reload.', error);
}

function sessionRow() {
  return $state.snapshot({
    date: today,
    program: day.programKey,
    order: day.order,
    gear: day.gear,
    finished: day.finished,
    restToday: day.restToday,
    cardio: Object.fromEntries(day.cardio.map((c) => [c.id, c.status])),
    slots: Object.fromEntries(
      Object.values(day.slots).map((s) => [
        s.id,
        { status: s.status, swappedTo: s.swappedTo, doneAs: s.doneAs, later: s.later, planned: s.planned },
      ]),
    ),
    rest: { running: rest.running, endsAt: rest.endsAt, total: rest.total },
  });
}

// What the server keeps of the session-level state.
function serverState() {
  return {
    gear: { ...day.gear },
    cardio: Object.fromEntries(day.cardio.map((c) => [c.id, c.status])),
    finished: day.finished,
    rest_timer: day.restToday,
    order: [...day.order],
    slots: Object.fromEntries(
      Object.values(day.slots).map((s) => [
        s.id,
        { status: s.status, swapped_to: s.swappedTo, done_as: s.doneAs, later: s.later, planned_sets: s.planned },
      ]),
    ),
  };
}

function saveSet(slot, k) {
  const set = slot.sets[k];
  const row = {
    id: setId(slot.id, k),
    date: today,
    slotId: slot.id,
    set: k,
    exerciseId: slot.doneAs,
    w: set.w,
    r: set.r ?? null,
    s: set.s ?? null,
    rir: set.rir,
    pr: set.status === 'pr',
    loggedAt: new Date().toISOString(),
  };
  db.sets.put(row).catch(warn);
  enqueue({
    kind: 'set',
    method: 'POST',
    path: path('/sets'),
    body: {
      client_id: row.id,
      slot_key: slot.id,
      exercise_id: row.exerciseId,
      set_index: k,
      weight_lb: row.w,
      reps: row.r,
      seconds: row.s,
      rir: row.rir,
    },
  });
}

// The server has the full history; if it disagrees about a PR, its answer wins.
onResult('set', (reply) => {
  if (!reply || reply.client_id.split('/')[0] !== today) return;
  const [, slotId, k] = reply.client_id.split('/');
  const set = day.slots[slotId]?.sets[Number(k)];
  if (!set || (set.status !== 'done' && set.status !== 'pr')) return;
  const status = reply.is_pr ? 'pr' : 'done';
  if (set.status !== status) {
    set.status = status;
    db.sets.update(reply.client_id, { pr: reply.is_pr }).catch(warn);
    if (!reply.is_pr && ui.banner?.slotId === slotId) ui.banner = null;
  }
});

function restore(session, sets, stops) {
  Object.assign(day, {
    order: session.order,
    gear: session.gear,
    finished: session.finished,
    restToday: session.restToday ?? null,
  });
  for (const [id, meta] of Object.entries(session.slots)) {
    if (day.slots[id]) Object.assign(day.slots[id], meta);
  }
  for (const c of day.cardio) c.status = session.cardio?.[c.id] ?? 'todo';
  for (const row of sets) {
    const slot = day.slots[row.slotId];
    if (!slot) continue;
    while (slot.sets.length < row.set) slot.sets.push({ status: 'todo' });
    slot.sets[row.set] = { w: row.w, r: row.r, s: row.s, rir: row.rir, status: row.pr ? 'pr' : 'done' };
  }
  // A stop marks its own set only; it never covers sets logged after the exercise reopened.
  for (const row of stops) {
    const slot = day.slots[row.slotId];
    if (!slot) continue;
    while (slot.sets.length < row.set) slot.sets.push({ status: 'todo' });
    if (!isLogged(slot.sets[row.set] ?? { status: 'todo' })) {
      slot.sets[row.set] = { w: row.w, status: 'stopped', symptom: row.symptom, note: row.note };
    }
  }
  // Today's set count (added or removed sets), then: sets left to do on an ended exercise show
  // as skipped, as they did before the reload.
  for (const slot of Object.values(day.slots)) {
    if (slot.planned != null) slot.sets = fitSets(slot.sets, slot.planned);
  }
  for (const slot of Object.values(day.slots)) {
    if (ENDED.includes(slot.status)) {
      slot.sets = slot.sets.map((set) => (set.status === 'todo' ? { status: 'skipped' } : set));
    }
  }
  if (session.rest?.running && restMode() !== 'off') {
    Object.assign(rest, session.rest, { now: Date.now(), buzzed: session.rest.endsAt <= Date.now() });
  }
}

// Nothing on this phone for today, but the server has a session (another device, or cleared
// site data): take the server's copy.
function fromServer(s) {
  const slots = {};
  for (const [key, v] of Object.entries(s.slots)) {
    slots[key] = {
      status: v.status,
      swappedTo: v.swapped_to,
      doneAs: v.done_as,
      later: v.later,
      planned: v.planned_sets ?? null,
    };
  }
  const sets = s.sets.map((x) => ({
    id: x.client_id,
    date: today,
    slotId: x.slot_key,
    set: x.set_index,
    exerciseId: x.exercise_id,
    w: x.weight_lb,
    r: x.reps,
    s: x.seconds,
    rir: x.rir,
    pr: x.is_pr,
  }));
  const stops = s.stops.map((x) => ({
    id: x.client_id,
    date: today,
    slotId: x.slot_key,
    set: x.set_index,
    exerciseId: x.exercise_id,
    w: x.weight_lb,
    symptom: x.symptom,
    note: x.note,
  }));
  const order = s.order.filter((k) => day.slots[k]);
  for (const k of day.order) if (!order.includes(k)) order.push(k);
  return {
    session: { order, gear: s.gear, finished: s.finished, restToday: s.rest_timer ?? null, slots, cardio: s.cardio ?? {} },
    sets,
    stops,
  };
}

// Call once before the first render.
export async function loadToday() {
  const server = await loadSource(today);
  Object.assign(day, blankDay());
  startSync();
  if (source.status === 'error') return;
  try {
    const [session, sets, stops] = await Promise.all([
      db.sessions.get(today),
      db.sets.where('date').equals(today).toArray(),
      db.stops.where('date').equals(today).toArray(),
    ]);
    if (session && session.program === day.programKey) {
      restore(session, sets, stops);
    } else if (
      server &&
      (server.sets.length ||
        server.stops.length ||
        server.finished ||
        server.rest_timer ||
        Object.keys(server.cardio ?? {}).length)
    ) {
      const copy = fromServer(server);
      restore(copy.session, copy.sets, copy.stops);
      await db.sets.bulkPut(copy.sets);
      await db.stops.bulkPut(copy.stops);
    } else if (source.demo) {
      applyDemoSeed();
      for (const slot of Object.values(day.slots)) {
        slot.sets.forEach((set, k) => set.status === 'done' && saveSet(slot, k));
      }
    }
  } catch (error) {
    warn(error);
    if (source.demo) applyDemoSeed();
  }
  await fillMissingExercises();
  // The full library, cached for the swap sheet's "All exercises" (so it works with no signal).
  if (!source.demo) loadLibrary(lastText).catch(() => {});
  // From here on, every change to session-level state is written through.
  let sent = JSON.stringify(serverState());
  $effect.root(() => {
    $effect(() => {
      db.sessions.put(sessionRow()).catch(warn);
    });
    $effect(() => {
      const body = serverState();
      const json = JSON.stringify(body);
      if (json === sent) return;
      sent = json;
      enqueue({ kind: 'state', method: 'PUT', path: path(), body, coalesce: `state/${today}` });
    });
  });
}

// Clears today's session from this device and starts over.
export async function resetToday() {
  await db.transaction('rw', db.sessions, db.sets, db.stops, async () => {
    await db.sessions.delete(today);
    await db.sets.where('date').equals(today).delete();
    await db.stops.where('date').equals(today).delete();
  });
  location.hash = '#/';
  location.reload();
}

// ---------- Reading ----------

export function fmt(n) {
  return n == null ? '—' : String(Math.round(n * 10) / 10);
}

export function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function gearAlternative(exerciseId) {
  const ex = CATALOG[exerciseId];
  return ex?.gear && !day.gear[ex.gear] ? ex.alt : null;
}

export function exerciseFor(slot) {
  return CATALOG[slot.doneAs ?? slot.swappedTo ?? gearAlternative(slot.exerciseId) ?? slot.exerciseId];
}

// How sets are measured for this slot's exercise: the plan's own target when doing the planned
// exercise (or its either/or option), otherwise the substitute's default.
export function measureFor(slot) {
  const ex = exerciseFor(slot);
  const planned = ex.id === slot.exerciseId || ex.id === slot.plan.alt;
  return {
    measure: planned ? slot.plan.target.measure : (ex.measure ?? 'reps'),
    perSide: planned ? slot.plan.target.perSide : !!ex.perSide,
    assisted: !!ex.assisted,
    min: planned ? slot.plan.target.min : null,
  };
}

function range(min, max) {
  return min === max ? `${min}` : `${min}–${max}`;
}

// "3 × 8–12", "2 × 30 s / side", "2–3 × 5–8", or the program's own words when not parsed.
export function targetText(plan) {
  const t = plan.target;
  if (t.min == null) return t.text ?? '';
  const unit = t.measure === 'seconds' ? ' s' : '';
  return `${range(t.min, t.max)}${unit}${t.perSide ? ' / side' : ''}`;
}

export function planText(slot) {
  const p = slot.plan;
  if (!p.loggable) return p.setsText ?? '';
  return `${range(p.setsMin, p.sets)} × ${targetText(p)}`;
}

// "60 lb × 10", "45 lb assist × 8", "30 s at 25 lb", "30 s / side"
export function setText(ex, set, perSide = ex?.perSide) {
  const side = perSide ? ' / side' : '';
  if (set.s != null && (ex?.measure === 'seconds' || set.r == null)) {
    return `${fmt(set.s)} s${side}${set.w ? ` at ${fmt(set.w)} lb` : ''}`;
  }
  if (ex?.assisted) return `${fmt(set.w)} lb assist × ${set.r}${side}`;
  if (!set.w) return `${set.r} reps${side}`;
  return `${fmt(set.w)} × ${set.r}${side}`;
}

export function lastText(ex) {
  if (ex.lastText) return ex.lastText;
  if (!ex.last?.length) return 'not logged yet';
  return `last ${setText(ex, ex.last[0])}`;
}

// Placeholder values for set k: see logic.js (no weight is offered on the very first log).
export function priorFor(ex, k, slot) {
  const earlier = slot?.sets.slice(0, k).findLast((s) => s.status === 'done' || s.status === 'pr');
  return placeholderFor(ex.last, k, earlier, slot?.plan.target.min);
}

export function loggedCount(slot) {
  return slot.sets.filter(isLogged).length;
}

// Why the row shows something other than the programmed exercise, if it does.
export function slotNote(slot) {
  const stop = slot.status === 'stopped' && slot.sets.find((set) => set.status === 'stopped');
  if (stop) return { kind: 'plain', text: `Stopped · ${stop.symptom}` };
  if (slot.status === 'skipped' && slot.plan.loggable) return { kind: 'plain', text: 'Skipped' };
  const ex = exerciseFor(slot);
  const planned = CATALOG[slot.exerciseId];
  if (ex.id !== planned.id && ex.id !== slot.plan.alt) {
    if (ex.id === slot.swappedTo) return { kind: 'info', text: `Swapped from ${planned.name}` };
    return { kind: 'info', text: `${planned.gear} not brought · alternative shown` };
  }
  if (slot.later) return { kind: 'plain', text: 'Moved to later' };
  return null;
}

// Required slots: not optional, and not the warm-up / cool-down checklist items.
export function requiredIds() {
  return day.order.filter((id) => !day.slots[id].plan.optional && day.slots[id].plan.loggable);
}

// How today stands for the calendar: null until something is logged, then partial, then
// done or stop once every exercise has ended (stop wins if any exercise was stopped).
export function dayStatus() {
  const slots = requiredIds().map((id) => day.slots[id]);
  const all = Object.values(day.slots);
  const ended = slots.every((s) => ENDED.includes(s.status)) || day.finished;
  const stopped = all.some(hasStop);
  if (ended && slots.length) return stopped ? 'stop' : 'done';
  if (stopped) return 'stop';
  return all.some((s) => s.doneAs) ? 'partial' : null;
}

// Completed sets logged today under this exercise, in program order.
export function todaySets(exerciseId) {
  return day.order
    .map((id) => day.slots[id])
    .filter((s) => s.doneAs === exerciseId)
    .flatMap((s) => s.sets.filter((set) => set.status === 'done' || set.status === 'pr'));
}

// Every completed set before this one: past sessions without a stop, last time, and today.
function priorSets(exerciseId) {
  const past = (HISTORY[exerciseId] ?? []).flatMap((s) =>
    s.sets.filter((_, k) => k !== s.stop?.set).map(([w, r, sec]) => ({ w, r, s: sec })),
  );
  return [...(CATALOG[exerciseId].last ?? []), ...past, ...todaySets(exerciseId)];
}

function hasStop(slot) {
  return slot.sets.some((set) => set.status === 'stopped');
}

// A stop today (not undone) means no personal record for that exercise today, as on the server.
function stoppedToday(exerciseId) {
  return Object.values(day.slots).some((s) => s.doneAs === exerciseId && hasStop(s));
}

// Ranked substitutions first (plus the either/or option), then other exercises for the muscle.
// Each exercise appears once, in the highest section it belongs to; excluded ones never.
// "All exercises" (the swap sheet) lists the rest of the library below these.
export function swapGroups(slot) {
  const planned = CATALOG[slot.exerciseId];
  const current = exerciseFor(slot).id;
  const option = (id) => ({ id, name: CATALOG[id].name, meta: lastText(CATALOG[id]) });
  const groups = [
    { label: 'Either / or', ids: slot.plan.alt ? [slot.plan.alt] : [] },
    { label: 'Your substitutions', ids: planned.subs ?? [] },
    { label: 'Same muscle', ids: planned.same ?? [] },
  ];
  if (current !== planned.id) groups.unshift({ label: 'In the program', ids: [planned.id] });
  return dedupeSwapGroups(groups, current, (id) => CATALOG[id]).map((g) => ({ label: g.label, options: g.ids.map(option) }));
}

// "All exercises" in the swap sheet: swaps in any library exercise for today, exactly like the
// other sections (sets log under the exercise actually done). An exercise today's program does
// not carry is added to the catalog from its library row, then completed in the background.
export function pickFromLibrary(row) {
  CATALOG[row.id] ??= catalogFromLibrary(row);
  pickSwap(row.id);
  if (!source.demo) ensureExercise(row.id).catch(() => {});
}

// Exercises the session uses but the catalog lacks: picked from the library, then reloaded with
// no signal (the cached program predates the pick). Filled from the cached library; failing
// that, a placeholder, so the page still opens and its logged sets still show.
async function fillMissingExercises() {
  const missing = Object.values(day.slots)
    .flatMap((s) => [s.swappedTo, s.doneAs])
    .filter((id) => id != null && !CATALOG[id]);
  if (!missing.length) return;
  try {
    for (const row of await loadLibrary(lastText)) {
      if (missing.some((id) => String(id) === String(row.id))) CATALOG[row.id] ??= catalogFromLibrary(row);
    }
  } catch {
    // no cached library either
  }
  for (const id of missing) CATALOG[id] ??= catalogFromLibrary({ id, name: 'Exercise not loaded yet', regionName: 'Other' });
}

// ---------- Pager ----------

// Every page of today's pager, in Today's order: [{ kind: 'slot' | 'cardio', id }].
export function pages() {
  return pageList(
    day.order.map((id) => ({ id, block: day.slots[id].plan.block, later: day.slots[id].later })),
    day.cardio,
  );
}

// What a page is: its name, status and whether it is optional. `item` is true for pages that
// are ticked Done / Skipped rather than logged set by set (warm-up, cool-down, cardio).
export function pageInfo(page) {
  if (page.kind === 'cardio') {
    const c = day.cardio.find((x) => x.id === page.id);
    return { name: c.mode, status: c.status, optional: false, item: true, cardio: c };
  }
  const slot = day.slots[page.id];
  return { name: exerciseFor(slot).name, status: slot.status, optional: slot.plan.optional, item: !slot.plan.loggable, slot };
}

// Where Start workout / Continue opens the pager.
export function firstUnfinishedId() {
  const list = pages();
  return list[firstUnfinished(list.map(pageInfo))]?.id;
}

export function restLeft() {
  return Math.max(0, Math.ceil((rest.endsAt - rest.now) / 1000));
}

export function blockLabel(block) {
  return BLOCKS[block] ?? block;
}

// ---------- Today ----------

export function toggleGear(name) {
  day.gear[name] = !day.gear[name];
}

export function later(slotId) {
  const slot = day.slots[slotId];
  day.order = [...day.order.filter((id) => id !== slotId), slotId];
  slot.later = true;
}

export function finish() {
  day.finished = true;
}

// What Finish would end: see openAtFinish in logic.js.
export function openSlots() {
  return openAtFinish(
    day.order.map((id) => {
      const s = day.slots[id];
      return { id, status: s.status, optional: s.plan.optional, loggable: s.plan.loggable, logged: loggedCount(s) };
    }),
  );
}

// Ends every open exercise (Skipped, or kept with its logged sets) so the day can finish.
function endOpen() {
  const { skip, end, reset } = openSlots();
  for (const id of skip) day.slots[id].status = 'skipped';
  for (const id of reset) day.slots[id].status = 'todo';
  for (const id of end) {
    const slot = day.slots[id];
    slot.sets = slot.sets.map((set) => (set.status === 'todo' ? { status: 'skipped' } : set));
    slot.status = 'done';
  }
  skipRest();
}

// Finish, then push everything to the server now and report what is still waiting.
export async function finishAndSync() {
  endOpen();
  finish();
  await tick(); // run the effect that queues the session-state change
  return syncNow();
}

// Checklist items (warm-up, cool-down, unparsed doses): done, skipped, or back to todo.
export function markItem(slotId, status) {
  const slot = day.slots[slotId];
  slot.status = slot.status === status ? 'todo' : status;
}

export function markCardio(id, status) {
  const c = day.cardio.find((x) => x.id === id);
  c.status = c.status === status ? 'todo' : status;
}

export function openSwap(slotId) {
  ui.swapFor = slotId;
}

export function closeSwap() {
  ui.swapFor = null;
}

export function pickSwap(exerciseId) {
  const slot = day.slots[ui.swapFor];
  slot.swappedTo = exerciseId === slot.exerciseId ? null : exerciseId;
  ui.swapFor = null;
}

// ---------- Set logging ----------

// Logs the next set: the first planned set still to do, or an extra set after the plan. Opening
// or leaving an exercise changes nothing; only logging does. Workouts are never linear: no state
// locks logging, and logging into a Skipped, Stopped or Done exercise reopens it (and a finished
// workout). The exercise marks itself Done once its last planned set is logged, and stays Done
// through extra sets.
export function logSet(slotId, { w, r, s, rir }) {
  const slot = day.slots[slotId];
  slot.sets = reopenSets(slot.sets);
  day.finished = false;
  const k = nextSetIndex(slot.sets);
  const ex = exerciseFor(slot);
  const m = measureFor(slot);
  const value = m.measure === 'seconds' ? { w, s, r: null } : { w, r, s: null };
  const pr =
    !stoppedToday(ex.id) &&
    isPr(value, priorSets(ex.id), { assisted: m.assisted, measure: m.measure, repFloor: m.min });
  const wasDone = slot.status === 'done' && !slot.sets.some((x) => x.status === 'todo');
  slot.doneAs = ex.id;
  slot.sets[k] = { ...value, rir, status: pr ? 'pr' : 'done' };
  saveSet(slot, k);
  ui.banner = pr
    ? { slotId, text: setText(ex, value, m.perSide), e1: !m.assisted && m.measure === 'reps' && w ? Math.round(e1rm(w, r)) : null }
    : null;
  slot.status = wasDone ? 'done' : statusAfterLog(slot.sets);
  // After every set: each logged set, the last one too (that is the rest before the next
  // exercise). After each exercise: only when this set completes the plan; any other set means
  // the rest is over.
  const finishedNow = slot.status === 'done' && !wasDone;
  if (restMode() === 'set' || (restMode() === 'exercise' && finishedNow)) startRest(restFor(slot));
  else skipRest();
}

// Only the most recent set can be undone. An undone extra set is removed; a planned one goes
// back to to-do.
export function undoSet(slotId, k) {
  const slot = day.slots[slotId];
  if (k >= plannedSets(slot) && k === slot.sets.length - 1) slot.sets.splice(k, 1);
  else slot.sets[k] = { status: 'todo' };
  db.sets.delete(setId(slotId, k)).catch(warn);
  enqueue({ kind: 'undo', method: 'DELETE', path: path(`/sets/${setId(slotId, k)}`) });
  // A stopped exercise stays Stopped (and keeps the exercise its stop was saved under).
  if (slot.status === 'stopped' && hasStop(slot)) {
    ui.banner = null;
    skipRest();
    return;
  }
  if (!loggedCount(slot)) slot.doneAs = null;
  slot.status = slot.doneAs ? statusAfterLog(slot.sets) : 'todo';
  ui.banner = null;
  skipRest();
}

// ---------- Today's set count ----------

// Sets planned for this exercise today: the program's count, or today's after Add / Remove set.
export function plannedSets(slot) {
  return slot.planned ?? slot.plan.sets;
}

// "+ Add set": one more planned set for today, at the end (after any extra sets, which then count
// as planned). A Done exercise is open again until it is logged; nothing else changes until then.
// The program is unchanged.
export function addSet(slotId) {
  const slot = day.slots[slotId];
  slot.sets.push({ status: 'todo' });
  slot.planned = slot.sets.length;
  if (slot.status === 'done') slot.status = 'active';
}

// "Remove set N": drops an unrecorded planned set for today (see canRemoveSet: never a logged
// or stopped one, and at least one set stays). Removing the last set still to do completes a
// started exercise, as logging it would have.
export function removeSet(slotId, k) {
  const slot = day.slots[slotId];
  if (!canRemoveSet(slot.sets, k)) return;
  const planned = plannedSets(slot);
  slot.sets.splice(k, 1);
  slot.planned = Math.max(1, k < planned ? planned - 1 : planned);
  if (slot.status === 'active' || slot.status === 'done') slot.status = statusAfterLog(slot.sets);
  else if (slot.status === 'todo' && slot.doneAs && !slot.sets.some((x) => x.status === 'todo')) slot.status = 'done';
}

export { canRemoveSet };

// Ends an exercise with a set range early ("2–3 sets" after the second): the rest are skipped.
// Skip (not Stop): the exercise is Skipped for today, its sets still to do are skipped, and
// that is all. No stop event, no symptom, nothing in the exercise's history; logged sets stay.
// Logging a set reopens it (logSet); Undo skip puts it back as it was.
export function skipSlot(slotId) {
  const slot = day.slots[slotId];
  slot.sets = slot.sets.map((set) => (set.status === 'todo' ? { status: 'skipped' } : set));
  slot.status = 'skipped';
}

export function undoSkip(slotId) {
  const slot = day.slots[slotId];
  slot.sets = slot.sets.map((set) => (set.status === 'skipped' ? { status: 'todo' } : set));
  slot.status = slot.doneAs ? statusAfterLog(slot.sets) : 'todo';
}

export function finishSlot(slotId) {
  const slot = day.slots[slotId];
  slot.sets = slot.sets.map((set) => (set.status === 'todo' ? { status: 'skipped' } : set));
  slot.status = 'done';
  // The exercise is over: its rest starts now in After each exercise mode. After every set,
  // the rest from the set just logged keeps running.
  if (restMode() === 'exercise') startRest(restFor(slot));
}

// Ends the exercise: the current set is saved as stopped, the rest as skipped.
export function stopSlot(slotId, { w, symptom, note }) {
  const slot = day.slots[slotId];
  const k = nextSetIndex(slot.sets);
  slot.doneAs = exerciseFor(slot).id;
  slot.sets = slot.sets.map((set, i) => {
    if (i < k) return set;
    if (i === k) return { w, status: 'stopped', symptom, note };
    return { status: 'skipped' };
  });
  const row = {
    id: `${today}/${slotId}`,
    date: today,
    slotId,
    set: k,
    exerciseId: slot.doneAs,
    w,
    symptom,
    note,
    at: new Date().toISOString(),
  };
  db.stops.put(row).catch(warn);
  enqueue({
    kind: 'stop',
    method: 'POST',
    path: path('/stops'),
    body: {
      client_id: row.id,
      slot_key: slotId,
      exercise_id: row.exerciseId,
      set_index: k,
      weight_lb: w,
      symptom,
      note: note || null,
    },
  });
  slot.status = 'stopped';
  ui.banner = null;
  skipRest();
}

// Undo stop: deletes the stop event here and on the server (history, calendar, records) and
// reopens the exercise as it was before the stop.
export function undoStop(slotId) {
  const slot = day.slots[slotId];
  const id = `${today}/${slotId}`;
  slot.sets = unstopSets(slot.sets, plannedSets(slot));
  if (!loggedCount(slot)) slot.doneAs = null;
  slot.status = slot.doneAs ? statusAfterLog(slot.sets) : 'todo';
  day.finished = false;
  db.stops.delete(id).catch(warn);
  enqueue({ kind: 'unstop', method: 'DELETE', path: path(`/stops/${id}`) });
}

// ---------- Rest timer ----------

// The rest timer in force now: Settings > Workout > Rest timer, unless the pager's toggle turned
// it on or off for today. Turned on for today while the setting is Off, it runs after every set.
export function restMode() {
  if (day.restToday === 'off') return 'off';
  if (day.restToday === 'on') return prefs.restMode === 'off' ? 'set' : prefs.restMode;
  return prefs.restMode;
}

// Rest length: the exercise's rest from the program when it has one, else Default rest.
export function restFor(slot) {
  return slot.plan.rest ?? prefs.defaultRest;
}

// The pager's toggle: on or off for the rest of today, without changing Settings. Turning it
// off ends a running countdown.
export function toggleRestToday() {
  day.restToday = restMode() === 'off' ? 'on' : 'off';
  if (day.restToday === 'off') skipRest();
}

// Starts a countdown, unless the rest timer is off (in Settings or for today).
export function startRest(seconds) {
  if (restMode() === 'off') return;
  rest.total = seconds;
  rest.now = Date.now();
  rest.endsAt = rest.now + seconds * 1000;
  rest.running = true;
  rest.buzzed = false;
}

// Adds to what is left; after zero it starts a fresh countdown.
export function addRest(seconds) {
  rest.now = Date.now();
  rest.endsAt = Math.max(rest.endsAt, rest.now) + seconds * 1000;
  rest.total = Math.max(rest.total, restLeft());
  rest.buzzed = false;
}

export function skipRest() {
  rest.running = false;
}
