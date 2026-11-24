// Every lift with sessions, for the Progress › Lift tab: real mode from /api/progress `lifts`
// (set by set, so deleted sets drop out here too), demo mode from the made-up history; both plus
// today's live session from this phone. [{ id, name, assisted, measure, unit, label, sessions }]
import { dateKey } from '../db.js';
import { sessionsFor } from './history.js';
import { CATALOG, HISTORY } from './source.svelte.js';
import { day } from './workout.svelte.js';

function fromApi(lifts, todayKey) {
  const history = {};
  const catalog = {};
  for (const l of lifts) {
    catalog[l.exercise_id] = { id: l.exercise_id, name: l.name, assisted: l.assisted, measure: l.measure, perSide: l.per_side };
    history[l.exercise_id] = l.sessions
      .filter((s) => s.date !== todayKey) // today comes from this phone's live copy
      .map((s) => {
        const sets = s.sets.map((x) => [x.w ?? 0, x.r, x.s, x.id]);
        let stop = null;
        if (s.stop) {
          stop = { set: sets.length, symptom: s.stop.symptom };
          sets.push([s.stop.w ?? 0, null, null, `stop|${l.exercise_id}|${s.date}`]);
        }
        return { date: s.date, sets, stop };
      });
  }
  return { history, catalog };
}

// How a lift's value reads: est. 1RM in lb, assistance (lower is better), seconds, or reps.
function describe(ex, sessions) {
  if (ex.measure === 'seconds') return { unit: 's', label: 'longest hold' };
  if (ex.assisted) return { unit: 'lb assist', label: 'least assistance' };
  if (sessions.some((s) => s.top?.w)) return { unit: 'lb', label: 'est. 1RM' };
  return { unit: 'reps', label: 'best set' };
}

export function allLifts(api) {
  const todayKey = dateKey();
  const { history, catalog } = api ? fromApi(api.lifts ?? [], todayKey) : { history: HISTORY, catalog: CATALOG };
  const ids = new Set(Object.keys(history).map(String));
  for (const s of Object.values(day.slots)) {
    if (s.doneAs == null || !s.plan.loggable || !CATALOG[s.doneAs]) continue;
    ids.add(String(s.doneAs));
    catalog[s.doneAs] ??= CATALOG[s.doneAs];
  }
  return [...ids]
    .filter((id) => catalog[id])
    .map((id) => {
      const ex = catalog[id];
      const sessions = sessionsFor(id, history, catalog, true);
      return { id, name: ex.name, assisted: !!ex.assisted, measure: ex.measure ?? 'reps', ...describe(ex, sessions), sessions };
    })
    .filter((l) => l.sessions.length);
}
