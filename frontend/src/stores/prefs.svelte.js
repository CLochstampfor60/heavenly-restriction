// Account settings (Settings > Workout). Saved to the account on the server, so the phone and
// the PC agree, and cached in IndexedDB so they apply with no signal. A change made offline is
// queued like any other write, and wins over the server's copy until it has been sent.
import { db } from '../db.js';
import { isDemo } from '../mode.js';
import { api, enqueue } from './sync.svelte.js';

// Defaults for a new account (the server has the same).
export const prefs = $state({ restTimer: true });

const KEY = 'account';

function cache() {
  db.prefs.put({ key: KEY, value: $state.snapshot(prefs) }).catch(() => {});
}

function fromServer(data) {
  return { restTimer: data.rest_timer };
}

// This device's copy first (awaited, before the first render); the server's copy after, in the
// background, so a slow or missing signal never holds up opening the app.
export async function loadPrefs() {
  try {
    const row = await db.prefs.get(KEY);
    if (row) Object.assign(prefs, row.value);
  } catch {
    // IndexedDB unavailable: defaults until the server answers
  }
  if (!isDemo()) refreshPrefs();
}

async function refreshPrefs() {
  try {
    const data = await api('GET', '/api/settings');
    const waiting = await db.outbox.filter((e) => e.coalesce === 'prefs').count();
    if (waiting) return; // a change from this device has not reached the server yet
    Object.assign(prefs, fromServer(data));
    cache();
  } catch {
    // offline or signed out: keep the cached copy
  }
}

export function setRestTimer(on) {
  prefs.restTimer = on;
  cache();
  enqueue({ kind: 'prefs', method: 'PUT', path: '/api/settings', body: { rest_timer: on }, coalesce: 'prefs' });
}
