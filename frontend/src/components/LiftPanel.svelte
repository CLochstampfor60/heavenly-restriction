<script>
  // Progress › Lift: "Pounds" charts one lift (est. 1RM in lb); "% gain" charts up to five, each
  // as % change from its first session in the period (assisted lifts inverted, so up is better).
  // Under the chart, "Your lifts": every exercise logged in the period, most recently logged
  // first. Tapping a row charts it (Pounds) or adds / removes its line (% gain, at most five).
  // The view and the choices are remembered on this device.
  import Icon from './Icon.svelte';
  import LineChart, { fmt1 } from './LineChart.svelte';
  import MultiLineChart from './MultiLineChart.svelte';
  import Sparkline from './Sparkline.svelte';
  import { dateKey } from '../db.js';
  import { chooseLifts, gainPoints, inPeriod, liftRow, sortLifts } from '../logic.js';
  import { shortDate, longDate } from '../stores/history.js';
  import { allLifts } from '../stores/lifts.svelte.js';

  let { api = null } = $props();

  const todayKey = dateKey();
  const RANGES = [
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
  ];
  const store = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const keep = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  const lifts = $derived(allLifts(api));
  const rowsFor = (range) =>
    sortLifts(lifts.map((l) => ({ ...l, row: liftRow(l.sessions, range, todayKey), lastDate: '' })).flatMap((l) => (l.row ? [{ ...l, lastDate: l.row.lastDate }] : [])));
  const offered = $derived(RANGES.filter((r) => rowsFor(r.id).length));
  let range = $state(null);
  const shownRange = $derived(offered.some((r) => r.id === range) ? range : (offered[0]?.id ?? 'month'));
  const rows = $derived(rowsFor(shownRange));

  // The charted lift: the saved choice while it is listed, else the most recently logged.
  let one = $state(store('hr-lift-one', null));
  const chosen = $derived(chooseLifts(one ? [one] : [], rows.map((r) => r.id), 1)[0]);
  const lift = $derived(rows.find((r) => r.id === chosen));

  // ---------- View: Pounds (one lift) or % gain (up to five) ----------
  const MAX_LINES = 5;
  let view = $state(store('hr-lift-view', 'pounds'));
  let many = $state(store('hr-lift-many', null));
  let hint = $state('');
  const chosenMany = $derived(chooseLifts(many, rows.map((r) => r.id), MAX_LINES));
  const lineOf = (id) => chosenMany.indexOf(String(id)); // its color slot, -1 when not charted

  function setView(v) {
    view = v;
    keep('hr-lift-view', v);
    hint = '';
  }

  function pick(id) {
    if (view === 'gain') return toggleLine(String(id));
    one = id;
    keep('hr-lift-one', id);
    picked = null;
  }

  function toggleLine(id) {
    hint = '';
    let next = [...chosenMany];
    if (next.includes(id)) {
      if (next.length === 1) {
        hint = 'At least one lift stays on the chart.';
        return;
      }
      next = next.filter((x) => x !== id);
    } else if (next.length >= MAX_LINES) {
      hint = `Up to ${MAX_LINES} lines: tap a charted lift to remove it first.`;
      return;
    } else {
      next.push(id);
    }
    many = next;
    keep('hr-lift-many', next);
  }

  const series = $derived(
    chosenMany
      .map((id) => rows.find((r) => r.id === id))
      .filter(Boolean)
      .map((r) => ({ id: r.id, name: r.name, assisted: r.assisted, points: gainPoints(r.row.points, r.assisted) })),
  );
  const best = $derived(
    series.filter((s) => s.points.length).sort((a, b) => b.points.at(-1).value - a.points.at(-1).value)[0],
  );
  const signed = (v) => `${v >= 0.05 ? '+' : v <= -0.05 ? '−' : ''}${fmt1(Math.abs(v))}%`;
  const gainAria = $derived(
    `% change in est. 1RM from each lift's first session, ${shownRange === 'month' ? 'this month' : 'the last 12 months'}: ` +
      series.map((s) => `${s.name}${s.assisted ? ' (assistance, inverted)' : ''} ${signed(s.points.at(-1)?.value ?? 0)}`).join(', '),
  );

  // ---------- Pounds chart and readout ----------
  let picked = $state(null);
  // The period's sessions; a stop sits on the axis as an octagon and the line skips it.
  const pts = $derived(
    lift
      ? lift.sessions
          .filter((s) => inPeriod(s.date, shownRange, todayKey) && (s.stop || s.top))
          .map((s) => ({ date: s.date, x: shortDate(s.date), value: s.stop ? (s.stop.w ?? 0) : s.e1, pr: s.pr, stopped: !!s.stop }))
      : [],
  );
  const latestIdx = $derived(pts.findLastIndex((p) => !p.stopped));
  const tapped = $derived(picked !== null && picked < pts.length);
  const sel = $derived(tapped ? picked : latestIdx);
  const cur = $derived(pts[sel]);
  const change = $derived(lift?.row.change);
  const lowerBetter = $derived(!!lift?.assisted);
  const word = (delta, unit) => {
    if (delta == null) return '';
    if (Math.abs(delta) < 0.05) return 'No change';
    return `${delta > 0 ? '▲ Up' : '▼ Down'} ${fmt1(Math.abs(delta))} ${unit}`;
  };
  const aria = $derived(
    lift && lift.row.points.length
      ? `${lift.name}, ${lift.label}, ${shownRange === 'month' ? 'this month' : 'the last 12 months'}, from ${fmt1(lift.row.first)} to ${fmt1(lift.row.latest)} ${lift.unit}`
      : '',
  );

  function rowLabel(r) {
    const parts = [r.name, `${r.label} ${fmt1(r.row.latest ?? 0)} ${r.unit}`];
    if (r.assisted) parts.push('lower is better');
    parts.push(r.row.change == null ? 'one session' : `${word(r.row.change, r.unit).replace(/^[▲▼] /, '')} over the period`);
    if (r.row.pr) parts.push('new personal record');
    if (view === 'gain' ? lineOf(r.id) >= 0 : r.id === chosen) parts.push('shown in the chart');
    return parts.join(', ');
  }
</script>

<div class="stack">
  <div class="hr-seg" role="group" aria-label="Chart view">
    <button class="hr-seg__btn" aria-pressed={view === 'pounds'} onclick={() => setView('pounds')}>Pounds</button>
    <button class="hr-seg__btn" aria-pressed={view === 'gain'} onclick={() => setView('gain')}>% gain</button>
  </div>
  {#if offered.length > 1}
    <div class="hr-seg" role="group" aria-label="Time range">
      {#each offered as r (r.id)}
        <button class="hr-seg__btn" aria-pressed={shownRange === r.id} onclick={() => { range = r.id; picked = null; }}>{r.label}</button>
      {/each}
    </div>
  {/if}

  {#if !lift}
    <span class="hr-eyebrow">Lift</span>
    <p class="body muted hint">Nothing logged in this period yet.</p>
  {:else if view === 'gain'}
    <div class="stack-tight">
      <span class="hr-eyebrow">% change in est. 1RM · {series.length} lift{series.length === 1 ? '' : 's'}</span>
      {#if best}
        <span class="readout">
          <span class="readout__value hr-num">{signed(best.points.at(-1).value)}</span>
          <span class="small muted readout__detail">Best gain · {best.name}</span>
          <span class="small readout__change">From each lift's first session in the period</span>
        </span>
      {/if}
    </div>
    <MultiLineChart {series} aria={gainAria} xLabel={shortDate} />
    <span class="meta">
      Assisted lifts are inverted: less assistance shows as a gain (marked "assist"). Tap lifts below to add or
      remove lines, up to {MAX_LINES}.
    </span>
    {#if hint}<span class="small" role="status">{hint}</span>{/if}
  {:else}
    <div class="stack-tight">
      <span class="hr-eyebrow">{lift.name} · {lift.label}</span>
      <span class="readout">
        {#if cur}<span class="readout__value hr-num">{fmt1(cur.value)} {cur.stopped ? 'lb' : lift.unit}</span>{/if}
        {#if cur}<span class="small muted readout__detail">{tapped ? 'Selected' : 'Latest'} · {longDate(cur.date)}{cur.stopped ? ' · stop event' : ''}</span>{/if}
        {#if cur?.pr && !cur.stopped}<span class="hr-pr hr-pr--quiet"><Icon name="bolt" />PR</span>{/if}
        <span class="small readout__change">
          {change == null ? 'One session in this period' : `${word(change, lift.unit)} from first to last`}{lowerBetter ? ' (lower is better)' : ''}
        </span>
      </span>
    </div>
    <LineChart points={pts} selected={sel} onselect={(i) => (picked = i)} area {aria} />
    <span class="meta">Tap a point for its value. Tap a lift below to chart it.</span>
  {/if}

  {#if rows.length}
    <section class="stack-tight" aria-labelledby="lifts-h">
      <h3 id="lifts-h" class="hr-eyebrow">Your lifts · {rows.length}</h3>
      <div class="stack-tight lift-list">
        {#each rows as r (r.id)}
          {@const line = view === 'gain' ? lineOf(r.id) : -1}
          <button
            class="lift-row"
            aria-pressed={view === 'gain' ? line >= 0 : r.id === chosen}
            aria-label={rowLabel(r)}
            onclick={() => pick(r.id)}
          >
            <span class="lift-row__text">
              <span class="option-name">
                {#if line >= 0}<svg class="ml-swatch" viewBox="0 0 16 4" aria-hidden="true"><line class="ml-tick ml-c{line}" x1="0" x2="16" y1="2" y2="2"></line></svg>{/if}{r.name}
              </span>
              <span class="meta hr-num">
                {fmt1(r.row.latest ?? 0)} {r.unit} · {r.label}{r.assisted ? ' · lower is better' : ''}
              </span>
              <span class="small hr-num lift-row__change">
                {r.row.change == null ? 'One session' : word(r.row.change, r.unit)}
                {#if r.row.pr}<span class="hr-pr hr-pr--quiet"><Icon name="bolt" />PR</span>{/if}
              </span>
            </span>
            <Sparkline
              values={r.row.points.map((p) => p.value)}
              label="{r.name}: {r.row.points.length} session{r.row.points.length === 1 ? '' : 's'}, from {fmt1(r.row.first ?? 0)} to {fmt1(r.row.latest ?? 0)} {r.unit}"
            />
          </button>
        {/each}
      </div>
    </section>
  {/if}
</div>
