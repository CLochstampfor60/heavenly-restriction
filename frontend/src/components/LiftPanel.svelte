<script>
  // Progress › Lift: "Your lifts", every exercise logged in the period, grouped by body region
  // (the Library's regions and order), most recently logged first in each. Regions are collapsible
  // ("Back · 6"); the ones with a PR and the one with the most recent session start open. No chart
  // here: each exercise's history chart is on its card.
  import Icon from './Icon.svelte';
  import { fmt1 } from './LineChart.svelte';
  import Sparkline from './Sparkline.svelte';
  import { dateKey } from '../db.js';
  import { chooseLifts, groupByRegion, liftRow, openRegions, sortLifts } from '../logic.js';
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
    sortLifts(lifts.flatMap((l) => {
      const row = liftRow(l.sessions, range, todayKey);
      return row ? [{ ...l, row, lastDate: row.lastDate }] : [];
    }));
  const offered = $derived(RANGES.filter((r) => rowsFor(r.id).length));
  let range = $state(null);
  const shownRange = $derived(offered.some((r) => r.id === range) ? range : (offered[0]?.id ?? 'month'));
  const rows = $derived(rowsFor(shownRange));

  const groups = $derived(groupByRegion(rows));
  // Taps open or close a region; until then it follows the default for the period.
  let toggled = $state({}); // `${range}/${region}` -> open
  const isOpen = (name) => toggled[`${shownRange}/${name}`] ?? openRegions(rows).has(name);

  let one = $state(store('hr-lift-one', null));
  const chosen = $derived(chooseLifts(one ? [one] : [], rows.map((r) => r.id), 1)[0]);

  function pick(id) {
    one = id;
    keep('hr-lift-one', id);
  }

  const word = (delta, unit) => {
    if (delta == null) return '';
    if (Math.abs(delta) < 0.05) return 'No change';
    return `${delta > 0 ? '▲ Up' : '▼ Down'} ${fmt1(Math.abs(delta))} ${unit}`;
  };

  function rowLabel(r) {
    const parts = [r.name, `${r.label} ${fmt1(r.row.latest ?? 0)} ${r.unit}`];
    if (r.assisted) parts.push('lower is better');
    parts.push(r.row.change == null ? 'one session' : `${word(r.row.change, r.unit).replace(/^[▲▼] /, '')} over the period`);
    if (r.row.pr) parts.push('new personal record');
    return parts.join(', ');
  }
</script>

<div class="stack">
  {#if offered.length > 1}
    <div class="hr-seg" role="group" aria-label="Time range">
      {#each offered as r (r.id)}
        <button class="hr-seg__btn" aria-pressed={shownRange === r.id} onclick={() => (range = r.id)}>{r.label}</button>
      {/each}
    </div>
  {/if}

  {#if !rows.length}
    <span class="hr-eyebrow">Your lifts</span>
    <p class="body muted hint">Nothing logged in this period yet.</p>
  {:else}
    <section class="stack-tight" aria-labelledby="lifts-h">
      <h3 id="lifts-h" class="hr-eyebrow">Your lifts · {rows.length}</h3>
      {#each groups as g (g.name)}
        {@const open = isOpen(g.name)}
        <div class="stack-tight">
          <button class="region-head" aria-expanded={open} onclick={() => (toggled[`${shownRange}/${g.name}`] = !open)}>
            <span class="region-head__name">{g.name} · {g.rows.length}</span>
            <span class="region-head__chev" class:region-head__chev--open={open}><Icon name="chevron-down" /></span>
          </button>
          {#if open}
            <div class="stack-tight lift-list">
              {#each g.rows as r (r.id)}
                <button class="lift-row" aria-pressed={r.id === chosen} aria-label={rowLabel(r)} onclick={() => pick(r.id)}>
                  <span class="lift-row__text">
                    <span class="option-name">{r.name}</span>
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
          {/if}
        </div>
      {/each}
    </section>
  {/if}
</div>
