// Local copy of today's session in IndexedDB, so a reload or a dropped signal loses nothing.
//   sessions: one row per day: program version, order, gear, swaps, statuses, rest timer.
//   sets:     one row per logged set, under the exercise actually done.
//   stops:    one row per stop event: symptom, load, set and note.
import Dexie from 'dexie';

export const db = new Dexie('heavenly-restriction');

db.version(1).stores({
  sessions: 'date',
  sets: 'id, date, exerciseId',
  stops: 'id, date, exerciseId',
});

// Local calendar date, YYYY-MM-DD.
export function dateKey(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
