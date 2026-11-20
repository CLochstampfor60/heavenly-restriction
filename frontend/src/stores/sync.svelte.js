// Server sync. Every write lands in IndexedDB first; the outbox then sends it to the API in
// order. With no signal the outbox waits and retries when the phone is back online.
import { db } from '../db.js';
import { outboxDisposition, queueCounts } from '../logic.js';
import { isDemo } from '../mode.js';

// pending: changes waiting for the server; pendingSets: how many of them are logged sets.
// authRequired: the server answered 401, so the queue is paused until you sign in.
export const sync = $state({ pending: 0, pendingSets: 0, offline: false, authRequired: false });

async function recount() {
  try {
    const counts = queueCounts(await db.outbox.toArray());
    sync.pending = counts.total;
    sync.pendingSets = counts.sets;
  } catch {
    // IndexedDB unavailable: leave the last counts
  }
}

const handlers = {};

export class HttpError extends Error {
  constructor(status, message, detail = '') {
    super(message);
    this.status = status;
    this.detail = detail; // the server's explanation, safe to show
  }
}

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const detail = await res.json().then(
      (b) => (typeof b.detail === 'string' ? b.detail : ''),
      () => '',
    );
    throw new HttpError(res.status, `${method} ${path}: ${res.status}`, detail);
  }
  return res.status === 204 ? null : res.json();
}

// GET with an IndexedDB fallback: returns { data, cached } or throws if neither is available.
export async function cachedGet(path) {
  try {
    const data = await api('GET', path);
    db.cache.put({ key: path, data, at: new Date().toISOString() }).catch(() => {});
    sync.offline = false;
    return { data, cached: false };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    sync.offline = true;
    const row = await db.cache.get(path);
    if (!row) throw error;
    return { data: row.data, cached: true };
  }
}

// A handler runs with the server's reply after an outbox entry of that kind is sent.
export function onResult(kind, fn) {
  handlers[kind] = fn;
}

// Writes to the outbox, in call order; syncNow() waits for them.
let queued = Promise.resolve();

// `coalesce`: a later entry with the same key replaces an unsent earlier one.
export function enqueue(entry) {
  if (isDemo()) return Promise.resolve();
  queued = queued.then(() => write(entry));
  return queued;
}

async function write(entry) {
  try {
    if (entry.coalesce) await db.outbox.filter((e) => e.coalesce === entry.coalesce).delete();
    await db.outbox.add(entry);
  } catch (error) {
    console.warn('Could not queue a change for the server.', error);
  }
  await recount();
  flush();
}

let running = null;

// Sends queued changes in order. Calls made while a run is in progress share that run.
export function flush() {
  if (isDemo()) return Promise.resolve();
  running ??= drain().finally(() => (running = null));
  return running;
}

// Forces a sync now (Finish workout) and reports what is still waiting.
export async function syncNow() {
  if (isDemo()) return { total: 0, sets: 0, offline: false };
  await queued;
  await flush();
  await flush(); // anything queued while the first run was finishing
  return { total: sync.pending, sets: sync.pendingSets, offline: sync.offline };
}

async function drain() {
  try {
    for (;;) {
      const entry = await db.outbox.orderBy('seq').first();
      if (!entry) break;
      try {
        const reply = await api(entry.method, entry.path, entry.body);
        sync.offline = false;
        sync.authRequired = false;
        handlers[entry.kind]?.(reply, entry);
      } catch (error) {
        const status = error instanceof HttpError ? error.status : null;
        const what = outboxDisposition(status);
        sync.offline = status === null;
        if (what === 'auth') sync.authRequired = true;
        if (what !== 'drop') break; // keep it; send again after sign-in or when back online
        console.warn('The server refused a change; dropping it.', entry, error);
      }
      await db.outbox.delete(entry.seq);
    }
  } finally {
    await recount();
  }
}

export function startSync() {
  if (isDemo()) return;
  window.addEventListener('online', flush);
  setInterval(() => sync.pending && !sync.authRequired && flush(), 30000);
  recount().then(flush);
}
