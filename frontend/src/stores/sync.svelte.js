// Server sync. Every write lands in IndexedDB first; the outbox then sends it to the API in
// order. With no signal the outbox waits and retries when the phone is back online.
import { db } from '../db.js';
import { isDemo } from '../mode.js';

export const sync = $state({ pending: 0, offline: false });

const handlers = {};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new HttpError(res.status, `${method} ${path}: ${res.status}`);
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

// `coalesce`: a later entry with the same key replaces an unsent earlier one.
export async function enqueue(entry) {
  if (isDemo()) return;
  try {
    if (entry.coalesce) await db.outbox.filter((e) => e.coalesce === entry.coalesce).delete();
    await db.outbox.add(entry);
  } catch (error) {
    console.warn('Could not queue a change for the server.', error);
  }
  flush();
}

let flushing = false;

export async function flush() {
  if (isDemo() || flushing) return;
  flushing = true;
  try {
    for (;;) {
      const entry = await db.outbox.orderBy('seq').first();
      if (!entry) break;
      try {
        const reply = await api(entry.method, entry.path, entry.body);
        sync.offline = false;
        handlers[entry.kind]?.(reply, entry);
      } catch (error) {
        if (!(error instanceof HttpError) || error.status >= 500) {
          sync.offline = !(error instanceof HttpError);
          break; // keep it; try again later
        }
        console.warn('The server refused a change; dropping it.', entry, error);
      }
      await db.outbox.delete(entry.seq);
    }
  } finally {
    flushing = false;
    sync.pending = await db.outbox.count().catch(() => 0);
  }
}

export function startSync() {
  if (isDemo()) return;
  window.addEventListener('online', flush);
  setInterval(() => sync.pending && flush(), 30000);
  flush();
}
