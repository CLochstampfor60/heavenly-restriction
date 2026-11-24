// Where the program comes from: the API (real mode) or the made-up fixtures (demo mode).
// Both fill the same shapes, so the screens do not care which one is in use.
//
// CATALOG[id]: { id, name, region: 'Region › Muscle', equip, assisted, measure: 'reps'|'seconds',
//                perSide, routine, pinned: [{kind, text}], last: [{w, r, s}] by set number,
//                lastText?, subs: [id], same: [id], media?, plan?, excluded?, grade? }
// PROGRAM:     { name, version, live, slots: [slot], cardio: [cardio], notes }
//   slot:      { id, exercise, alt, block, code, optional, loggable, sets, setsMin, setsText,
//                target: { measure, min, max, perSide, text }, rest (s or null), notes,
//              displayName }
// HISTORY[id]: past sessions, oldest first: { date, sets: [[w, r, s]], stop?, note? }
import { dateKey } from '../db.js';
import * as demo from '../fixtures/demo.js';
import { HISTORY as DEMO_HISTORY } from '../fixtures/history.js';
import { isDemo } from '../mode.js';
import { cachedGet } from './sync.svelte.js';

export const CATALOG = {};
export const HISTORY = {};
export const PROGRAM = { name: '', version: '', live: false, slots: [], cardio: [], notes: [] };
export const source = $state({ demo: isDemo(), status: 'loading', cached: false, error: '' });

export const BLOCKS = {
  warmup: 'Warm-up',
  main: 'Main lifts',
  core: 'Core',
  forearm: 'Forearm block',
  cardio: 'Cardio',
  cooldown: 'Cool-down',
};

function fromApi(e) {
  return {
    id: e.id,
    name: e.name,
    region: `${e.region ?? 'Other'} › ${e.muscle ?? 'Other'}`,
    equip: e.equipment ?? 'Not set',
    assisted: !!e.assisted,
    measure: e.measure ?? 'reps',
    perSide: !!e.per_side,
    routine: !!e.routine,
    pinned: (e.pinned ?? []).map((p) => ({ kind: p.kind, text: p.text })),
    last: (e.last ?? []).map((s) => ({ w: s.w ?? 0, r: s.r, s: s.s })),
    subs: (e.swaps ?? []).map((s) => s.id),
    same: e.same ?? [],
  };
}

function slotFromApi(s) {
  return {
    id: s.key,
    exercise: s.exercise_id,
    alt: s.alt_exercise_id,
    block: s.block,
    code: s.code,
    optional: s.optional,
    loggable: s.loggable,
    sets: s.loggable ? (s.sets_max ?? 0) : 0,
    setsMin: s.sets_min ?? s.sets_max ?? 0,
    setsText: s.sets_text,
    target: {
      measure: s.measure,
      min: s.target_min,
      max: s.target_max,
      perSide: s.per_side,
      text: s.target_text,
    },
    rest: s.rest_s ?? null, // the program's rest; null means Settings > Workout > Default rest
    notes: s.notes ?? [],
    displayName: s.display_name,
  };
}

function loadDemo() {
  for (const [id, ex] of Object.entries(demo.CATALOG)) {
    CATALOG[id] = { measure: 'reps', perSide: false, assisted: false, pinned: [], ...ex };
  }
  Object.assign(HISTORY, DEMO_HISTORY);
  Object.assign(PROGRAM, {
    name: demo.PROGRAM.name,
    version: demo.PROGRAM.version,
    live: false,
    notes: [],
    cardio: (demo.PROGRAM.cardio ?? []).map(cardioFrom),
    slots: demo.PROGRAM.slots.map((p, k) => ({
      id: p.id,
      exercise: p.exercise,
      alt: null,
      block: 'main',
      code: String(k + 1),
      optional: false,
      loggable: true,
      sets: p.sets,
      setsMin: p.sets,
      setsText: String(p.sets),
      target: { measure: 'reps', min: null, max: null, perSide: false, text: p.reps },
      rest: p.rest ?? null,
      notes: [],
      displayName: demo.CATALOG[p.exercise].name,
    })),
  });
}

// Today's program and the exercises it needs. Returns the server's session, if any.
export async function loadSource(date = dateKey()) {
  if (source.demo) {
    loadDemo();
    source.status = 'ready';
    return null;
  }
  let reply;
  try {
    reply = await cachedGet(`/api/today?date=${date}`);
  } catch (error) {
    source.status = 'error';
    source.error = String(error.message ?? error);
    return null;
  }
  const data = reply.data;
  source.cached = reply.cached;
  for (const e of Object.values(data.exercises)) CATALOG[e.id] = fromApi(e);
  Object.assign(PROGRAM, {
    name: data.day ? data.day.name : 'Rest day',
    version: data.version ?? '',
    dayKey: data.day?.key ?? null,
    live: true,
    notes: data.day?.notes ?? [],
    slots: data.slots.map(slotFromApi),
    cardio: data.cardio.map(cardioFrom),
  });
  source.status = data.version ? 'ready' : 'empty';
  return data.session;
}

function historyFromCard(sessions, today) {
  return sessions
    .filter((s) => s.date !== today) // today's sets come from the live session instead
    .map((s) => {
      const sets = s.sets.map((x) => [x.weight_lb ?? 0, x.reps, x.seconds]);
      let stop = null;
      if (s.stop) {
        stop = { set: sets.length, symptom: s.stop.symptom, note: s.stop.note ?? '' };
        sets.push([s.stop.weight_lb ?? 0, null, null]);
      }
      return { date: s.date, sets, stop, note: s.note || stop?.note || '', duration: s.duration_s ?? null };
    });
}

const loaded = new Set();

// The exercise card needs history and details today's payload does not carry.
export async function ensureExercise(id) {
  if (source.demo || loaded.has(String(id))) return CATALOG[id];
  try {
    const { data } = await cachedGet(`/api/exercises/${id}`);
    CATALOG[id] = {
      ...fromApi(data),
      plan: data.plan,
      excluded: data.excluded,
      media: (data.media ?? []).filter((m) => m.url).map((m) => ({ label: m.label ?? 'Link', url: m.url })),
    };
    for (const r of Object.values(data.related ?? {})) CATALOG[r.id] ??= fromApi(r);
    HISTORY[id] = historyFromCard(data.sessions, dateKey());
    loaded.add(String(id));
  } catch (error) {
    if (!CATALOG[id]) throw error;
  }
  return CATALOG[id];
}

// A catalog entry built from a library row, for an exercise picked from "All exercises" in the
// swap sheet that today's program does not carry. ensureExercise fills in the rest when online.
export function catalogFromLibrary(row) {
  return {
    id: row.id,
    name: row.name,
    region: `${row.regionName ?? 'Other'} › ${row.muscle ?? 'Other'}`,
    equip: row.equip ?? 'Not set',
    assisted: !!row.assisted,
    measure: row.measure ?? 'reps',
    perSide: !!row.perSide,
    routine: false,
    pinned: [],
    last: row.last ?? [],
    subs: [],
    same: [],
  };
}

// A cardio entry from the API (or the demo, shaped the same).
function cardioFrom(c, k) {
  return {
    id: `cardio${k + 1}`,
    mode: c.mode,
    minutes: c.minutes_min === c.minutes_max ? `${c.minutes_min}` : `${c.minutes_min}–${c.minutes_max}`,
    minutesMin: c.minutes_min,
    settings: c.settings ?? {},
  };
}

// Library rows: { id, name, regionName, muscle, equip, lastText, programDay, hasVideo,
//                 excluded, sub, grade }
export async function loadLibrary(lastText) {
  if (source.demo) {
    const inProgram = new Set(PROGRAM.slots.map((s) => s.exercise));
    const substitutes = new Set(
      [...inProgram]
        .flatMap((id) => [...(CATALOG[id].subs ?? []), ...(CATALOG[id].same ?? [])])
        .filter((id) => !inProgram.has(id)),
    );
    return Object.values(CATALOG).map((ex) => {
      const [region, muscle] = ex.region.split(' › ');
      return {
        ...ex,
        regionName: region,
        muscle,
        lastText: lastText(ex),
        programDay: inProgram.has(ex.id) ? PROGRAM.name : ex.day,
        hasVideo: !!ex.media?.length,
        sub: substitutes.has(ex.id),
        excluded: ex.excluded ? { kind: 'goal', label: 'Excluded' } : null,
      };
    });
  }
  const { data } = await cachedGet('/api/exercises');
  return data.exercises.map((e) => {
    const ex = {
      id: e.id,
      name: e.name,
      assisted: e.assisted,
      measure: e.measure,
      perSide: e.per_side,
      last: e.last ? [{ w: e.last.w ?? 0, r: e.last.r, s: e.last.s }] : [],
    };
    return {
      ...ex,
      regionName: e.region,
      muscle: e.muscle,
      equip: e.equipment ?? 'Not set',
      lastText: lastText(ex),
      programDay: e.days.join(' · '),
      hasVideo: e.has_video,
      sub: e.substitute,
      excluded: e.excluded,
    };
  });
}
