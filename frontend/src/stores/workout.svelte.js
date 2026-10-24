// Today's session. The program and exercise catalog are made-up demo data until the API
// lands; what happens in the session (sets, stops, swaps, order, gear) is kept in IndexedDB
// so a reload resumes where it left off.
import { db, dateKey } from '../db.js';
import { CATALOG, DEMO_SESSION, GEAR, PROGRAM } from '../fixtures/demo.js';

const today = dateKey();

export const day = $state(blankDay());
export const rest = $state({ running: false, endsAt: 0, total: 0, now: Date.now(), buzzed: false });
export const ui = $state({ swapFor: null, banner: null });

function blankDay() {
  const slots = {};
  for (const p of PROGRAM.slots) {
    slots[p.id] = {
      id: p.id,
      exerciseId: p.exercise,
      plan: { sets: p.sets, reps: p.reps, rest: p.rest },
      status: 'todo',
      swappedTo: null,
      // The exercise actually done; fixed once the first set is logged.
      doneAs: null,
      later: false,
      sets: Array.from({ length: p.sets }, () => ({ status: 'todo' })),
    };
  }
  return {
    name: PROGRAM.name,
    version: PROGRAM.version,
    order: PROGRAM.slots.map((p) => p.id),
    slots,
    gear: Object.fromEntries(GEAR.map((g) => [g, false])),
    gearOpen: false,
    finished: false,
  };
}

// First visit of the day: the demo starts mid-workout, as in the design.
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
    startRest(day.slots[resting].plan.rest);
    rest.endsAt = Date.now() + DEMO_SESSION.restLeft * 1000;
  }
}

// ---------- Persistence ----------

const setId = (slotId, k) => `${today}/${slotId}/${k}`;

function warn(error) {
  console.warn('Could not save to this device; the session will not survive a reload.', error);
}

function sessionRow() {
  return $state.snapshot({
    date: today,
    program: day.version,
    order: day.order,
    gear: day.gear,
    finished: day.finished,
    slots: Object.fromEntries(
      Object.values(day.slots).map((s) => [
        s.id,
        { status: s.status, swappedTo: s.swappedTo, doneAs: s.doneAs, later: s.later },
      ]),
    ),
    rest: { running: rest.running, endsAt: rest.endsAt, total: rest.total },
  });
}

function saveSet(slot, k) {
  const set = slot.sets[k];
  db.sets
    .put({
      id: setId(slot.id, k),
      date: today,
      slotId: slot.id,
      set: k,
      exerciseId: slot.doneAs,
      w: set.w,
      r: set.r,
      rir: set.rir,
      pr: set.status === 'pr',
      loggedAt: new Date().toISOString(),
    })
    .catch(warn);
}

function restore(session, sets, stops) {
  Object.assign(day, { order: session.order, gear: session.gear, finished: session.finished });
  for (const [id, meta] of Object.entries(session.slots)) {
    if (day.slots[id]) Object.assign(day.slots[id], meta);
  }
  for (const row of sets) {
    const slot = day.slots[row.slotId];
    if (!slot) continue;
    slot.sets[row.set] = { w: row.w, r: row.r, rir: row.rir, status: row.pr ? 'pr' : 'done' };
  }
  for (const row of stops) {
    const slot = day.slots[row.slotId];
    if (!slot) continue;
    slot.sets = slot.sets.map((set, k) => {
      if (k < row.set) return set;
      if (k === row.set) return { w: row.w, status: 'stopped', symptom: row.symptom, note: row.note };
      return { status: 'skipped' };
    });
  }
  if (session.rest.running) {
    Object.assign(rest, session.rest, { now: Date.now(), buzzed: session.rest.endsAt <= Date.now() });
  }
}

// Call once before the first render.
export async function loadToday() {
  try {
    const [session, sets, stops] = await Promise.all([
      db.sessions.get(today),
      db.sets.where('date').equals(today).toArray(),
      db.stops.where('date').equals(today).toArray(),
    ]);
    if (session) {
      restore(session, sets, stops);
    } else {
      applyDemoSeed();
      for (const slot of Object.values(day.slots)) {
        slot.sets.forEach((set, k) => set.status === 'done' && saveSet(slot, k));
      }
    }
  } catch (error) {
    warn(error);
    applyDemoSeed();
  }
  // From here on, every change to session-level state is written through.
  $effect.root(() => {
    $effect(() => {
      db.sessions.put(sessionRow()).catch(warn);
    });
  });
}

// Clears today's session from this device and starts the demo over.
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
  return String(Math.round(n * 10) / 10);
}

export function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function e1rm(w, r) {
  return w * (1 + r / 30);
}

function gearAlternative(exerciseId) {
  const ex = CATALOG[exerciseId];
  return ex.gear && !day.gear[ex.gear] ? ex.alt : null;
}

export function exerciseFor(slot) {
  return CATALOG[slot.doneAs ?? slot.swappedTo ?? gearAlternative(slot.exerciseId) ?? slot.exerciseId];
}

export function planText(slot) {
  return `${slot.plan.sets} × ${slot.plan.reps}`;
}

export function lastText(ex) {
  return ex.lastText ?? `last ${fmt(ex.last[0].w)} × ${ex.last[0].r}`;
}

// Last session's values for the same exercise and set number.
export function priorFor(ex, k) {
  return ex.last[Math.min(k, ex.last.length - 1)];
}

export function loggedCount(slot) {
  return slot.sets.filter((s) => s.status === 'done' || s.status === 'pr').length;
}

// Why the row shows something other than the programmed exercise, if it does.
export function slotNote(slot) {
  const ex = exerciseFor(slot);
  const planned = CATALOG[slot.exerciseId];
  if (ex.id !== planned.id) {
    if (ex.id === slot.swappedTo) return { kind: 'info', text: `Swapped from ${planned.name}` };
    return { kind: 'info', text: `${planned.gear} not brought · alternative shown` };
  }
  if (slot.later) return { kind: 'plain', text: 'Moved to later' };
  return null;
}

export function activeSlotId() {
  return day.order.find((id) => day.slots[id].status === 'active');
}

export function nextTodo() {
  return day.order.find((id) => day.slots[id].status === 'todo');
}

// Best estimated 1RM: last session's sets plus anything logged today for the same exercise.
function bestFor(exerciseId) {
  const today = Object.values(day.slots)
    .filter((s) => s.doneAs === exerciseId)
    .flatMap((s) => s.sets.filter((set) => set.status === 'done' || set.status === 'pr'));
  return Math.max(0, ...[...CATALOG[exerciseId].last, ...today].map((s) => e1rm(s.w, s.r)));
}

// Ranked substitutions first, then other exercises for the same muscle.
export function swapGroups(slot) {
  const planned = CATALOG[slot.exerciseId];
  const current = exerciseFor(slot).id;
  const option = (id) => ({ id, name: CATALOG[id].name, meta: lastText(CATALOG[id]) });
  const groups = [
    { label: 'Your substitutions', ids: planned.subs ?? [] },
    { label: 'Same muscle', ids: planned.same ?? [] },
  ];
  if (current !== planned.id) groups.unshift({ label: 'In the program', ids: [planned.id] });
  return groups
    .map((g) => ({ label: g.label, options: g.ids.filter((id) => id !== current).map(option) }))
    .filter((g) => g.options.length);
}

export function restLeft() {
  return Math.max(0, Math.ceil((rest.endsAt - rest.now) / 1000));
}

// ---------- Today ----------

export function toggleGear(name) {
  day.gear[name] = !day.gear[name];
}

export function later(slotId) {
  const slot = day.slots[slotId];
  day.order = [...day.order.filter((id) => id !== slotId), slotId];
  slot.later = true;
  if (slot.status === 'active') slot.status = 'todo';
}

export function start(slotId) {
  for (const id of day.order) {
    if (day.slots[id].status === 'active') day.slots[id].status = 'todo';
  }
  day.slots[slotId].status = 'active';
  day.finished = false;
}

export function finish() {
  day.finished = true;
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

export function logSet(slotId, { w, r, rir }) {
  const slot = day.slots[slotId];
  const k = slot.sets.findIndex((s) => s.status === 'todo');
  if (k === -1) return;
  const ex = exerciseFor(slot);
  const isPr = e1rm(w, r) > bestFor(ex.id) + 0.01;
  slot.doneAs = ex.id;
  slot.sets[k] = { w, r, rir, status: isPr ? 'pr' : 'done' };
  saveSet(slot, k);
  ui.banner = isPr ? { slotId, w, r, e1: Math.round(e1rm(w, r)) } : null;
  if (k === slot.sets.length - 1) {
    slot.status = 'done';
    skipRest();
  } else {
    startRest(slot.plan.rest);
  }
}

// Only the most recent set can be undone.
export function undoSet(slotId, k) {
  const slot = day.slots[slotId];
  slot.sets[k] = { status: 'todo' };
  db.sets.delete(setId(slotId, k)).catch(warn);
  slot.status = 'active';
  if (!loggedCount(slot)) slot.doneAs = null;
  ui.banner = null;
  skipRest();
}

// Ends the exercise: the current set is saved as stopped, the rest as skipped.
export function stopSlot(slotId, { w, symptom, note }) {
  const slot = day.slots[slotId];
  const k = slot.sets.findIndex((s) => s.status === 'todo');
  if (k === -1) return;
  slot.doneAs = exerciseFor(slot).id;
  slot.sets = slot.sets.map((set, i) => {
    if (i < k) return set;
    if (i === k) return { w, status: 'stopped', symptom, note };
    return { status: 'skipped' };
  });
  db.stops
    .put({
      id: `${today}/${slotId}`,
      date: today,
      slotId,
      set: k,
      exerciseId: slot.doneAs,
      w,
      symptom,
      note,
      at: new Date().toISOString(),
    })
    .catch(warn);
  slot.status = 'stopped';
  ui.banner = null;
  skipRest();
}

// ---------- Rest timer ----------

export function startRest(seconds) {
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
