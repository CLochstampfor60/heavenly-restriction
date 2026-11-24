// Account settings (Settings > Workout). Saved to the account on the server, so the phone and
// the PC agree, and cached in IndexedDB so they apply with no signal. A change made offline is
// queued like any other write, and wins over the server's copy until it has been sent.
import { db } from '../db.js';
import { isDemo } from '../mode.js';
import { api, enqueue } from './sync.svelte.js';

// Defaults for a new account (the server has the same).
//   restMode:    'off' | 'set' (after every set) | 'exercise' (once an exercise's last planned
//                set is logged)
//   defaultRest: seconds, when the program gives no rest; 15 s steps
export const prefs = $state({ restMode: 'set', defaultRest: 90 });
export const REST_MIN = 15;
export const REST_MAX = 600;

const KEY = 'account';

function cache() {
  db.prefs.put({ key: KEY, value: $state.snapshot(prefs) }).catch(() => {});
}

function fromServer(data) {
  return {
    restMode: data.rest_timer_mode ?? (data.rest_timer === false ? 'off' : 'set'),
    defaultRest: data.rest_default_s ?? 90,
  };
}

// A copy cached by an older version of the app holds only { restTimer: true | false }.
function fromCache(value) {
  const { restTimer, ...rest } = value;
  if (rest.restMode === undefined && restTimer !== undefined) rest.restMode = restTimer ? 'set' : 'off';
  return rest;
}

// This device's copy first (awaited, before the first render); the server's copy after, in the
// background, so a slow or missing signal never holds up opening the app.
export async function loadPrefs() {
  try {
    const row = await db.prefs.get(KEY);
    if (row) Object.assign(prefs, fromCache(row.value));
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

// Sends both settings, so a later change never loses an earlier one still waiting to be sent
// (queued changes to the settings replace each other).
function send() {
  cache();
  const body = { rest_timer_mode: prefs.restMode, rest_default_s: prefs.defaultRest };
  enqueue({ kind: 'prefs', method: 'PUT', path: '/api/settings', body, coalesce: 'prefs' });
}

export function setRestMode(mode) {
  prefs.restMode = mode;
  send();
}

export function setDefaultRest(seconds) {
  const s = Math.round(seconds / 15) * 15;
  prefs.defaultRest = Math.min(REST_MAX, Math.max(REST_MIN, s));
  send();
}
