// Sets deleted from history (the exercise card's recent sessions). Kept on this device (Dexie)
// so every view drops them at once, offline included: the card, its chart, PRs, and the Lift tab.
// In real mode the server is told after the 5 s Undo window (see deleteSet); a delete that was
// still waiting when the app closed is sent at the next launch.
import { db } from '../db.js';
import { isDemo } from '../mode.js';
import { enqueue } from './sync.svelte.js';

const KEY = 'deletedSets';
// id -> { date, sent }: date is the session's date (the API path needs it).
export const deleted = $state({ ids: {} });
const timers = {};

function save() {
  db.prefs.put({ key: KEY, value: $state.snapshot(deleted.ids) }).catch(() => {});
}

function send(id) {
  const entry = deleted.ids[id];
  if (!entry || entry.sent) return;
  if (!isDemo()) {
    enqueue({ kind: 'delete-set', method: 'DELETE', path: `/api/sets/${encodeURIComponent(id)}` });
  }
  deleted.ids[id] = { ...entry, sent: true };
  save();
}

export async function loadDeleted() {
  try {
    const row = await db.prefs.get(KEY);
    if (row) deleted.ids = row.value;
  } catch {
    // IndexedDB unavailable: nothing deleted on this device
  }
  for (const id of Object.keys(deleted.ids)) send(id); // left waiting when the app closed
}

export const isDeleted = (id) => id in deleted.ids;

// Hides the set everywhere now; tells the server when the Undo window ends.
export function deleteSet(id, date, undoMs = 5000) {
  deleted.ids[id] = { date, sent: false };
  save();
  clearTimeout(timers[id]);
  timers[id] = setTimeout(() => send(id), undoMs);
}

// Undo, within the window: nothing was sent, so the set simply comes back.
export function undoDelete(id) {
  if (deleted.ids[id]?.sent) return false;
  clearTimeout(timers[id]);
  delete deleted.ids[id];
  save();
  return true;
}
