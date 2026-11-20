// Local copy of today's session in IndexedDB, so a reload or a dropped signal loses nothing.
//   sessions: one row per day: program version, order, gear, swaps, statuses, rest timer.
//   sets:     one row per logged set, under the exercise actually done.
//   stops:    one row per stop event: symptom, load, set and note.
//   outbox:   writes waiting for the server, sent in order when online (real mode only).
//   cache:    last API responses, so the program still opens with no signal.
//   metrics:  bodyweight / waist entries not yet confirmed by the server (real mode).
// Demo mode keeps its own database so made-up sessions never reach real data.
import Dexie from 'dexie';
import { isDemo } from './mode.js';

export const db = new Dexie(isDemo() ? 'heavenly-restriction' : 'heavenly-restriction-live');

db.version(1).stores({
  sessions: 'date',
  sets: 'id, date, exerciseId',
  stops: 'id, date, exerciseId',
});
db.version(2).stores({
  outbox: '++seq',
  cache: 'key',
});
db.version(3).stores({
  metrics: 'date',
});

// Local calendar date, YYYY-MM-DD.
export function dateKey(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
