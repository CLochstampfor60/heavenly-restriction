// Bodyweight (lb) and waist (in), one entry per date. Saved to IndexedDB first and queued for the
// server; until the server confirms, the local copy overrides what the server last sent.
import { db } from '../db.js';
import { enqueue, onResult } from './sync.svelte.js';

// date -> { bodyweight, waist } (either may be null)
export const metrics = $state({ byDate: {} });

function warn(error) {
  console.warn('Could not save the measurement on this device.', error);
}

// Server entries, then anything saved on this phone that has not reached the server yet.
export async function loadMetrics(serverEntries = []) {
  const map = {};
  for (const e of serverEntries) map[e.date] = { bodyweight: e.bodyweight_lb, waist: e.waist_in };
  try {
    for (const row of await db.metrics.toArray()) {
      if (row.deleted) delete map[row.date];
      else map[row.date] = { bodyweight: row.bodyweight, waist: row.waist };
    }
  } catch (error) {
    warn(error);
  }
  metrics.byDate = map;
}

export function removeMetrics(date) {
  delete metrics.byDate[date];
  db.metrics.put({ date, deleted: true }).catch(warn);
  enqueue({ kind: 'metric', method: 'DELETE', path: `/api/body-metrics/${date}`, coalesce: `metric/${date}` });
}

export function saveMetrics(date, bodyweight, waist) {
  if (bodyweight == null && waist == null) return removeMetrics(date);
  metrics.byDate[date] = { bodyweight, waist };
  db.metrics.put({ date, bodyweight, waist, deleted: false }).catch(warn);
  enqueue({
    kind: 'metric',
    method: 'PUT',
    path: `/api/body-metrics/${date}`,
    body: { bodyweight_lb: bodyweight, waist_in: waist },
    coalesce: `metric/${date}`,
  });
}

// The newest value on or before a date, for the stepper's starting point.
export function lastKnown(kind, date) {
  const dates = Object.keys(metrics.byDate)
    .filter((d) => d <= date && metrics.byDate[d][kind] != null)
    .sort();
  return dates.length ? metrics.byDate[dates.at(-1)][kind] : null;
}

// Month: every entry this month. Year: monthly averages over the last 12 months.
export function bodySeries(kind, now) {
  const rows = Object.entries(metrics.byDate)
    .filter(([, v]) => v[kind] != null)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const ym = (d) => d.slice(0, 7);
  const thisMonth = ym(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const month = rows
    .filter(([d]) => ym(d) === thisMonth)
    .map(([d, v]) => [`${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`, v[kind]]);
  const year = [];
  for (let back = 11; back >= 0; back -= 1) {
    const m = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    const vals = rows.filter(([d]) => ym(d) === key).map(([, v]) => v[kind]);
    if (vals.length) {
      const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      const long = m.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      year.push([long[0], avg, null, long]);
    }
  }
  return { month, year };
}

// The server has it now; the server's copy is the truth from here on.
onResult('metric', (_reply, entry) => {
  const date = entry.path.split('/').pop();
  db.metrics.delete(date).catch(() => {});
});
