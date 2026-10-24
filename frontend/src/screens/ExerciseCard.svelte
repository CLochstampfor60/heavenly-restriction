<script>
  import Icon from '../components/Icon.svelte';
  import LineChart, { fmt1 } from '../components/LineChart.svelte';
  import { CATALOG, PROGRAM } from '../fixtures/demo.js';
  import { go } from '../router.svelte.js';
  import { longDate, sessionsFor, shortDate } from '../stores/history.js';
  import { clock, lastText } from '../stores/workout.svelte.js';

  let { id } = $props();

  const ex = $derived(CATALOG[id]);
  const slot = $derived(PROGRAM.slots.find((s) => s.exercise === id));
  const sessions = $derived(sessionsFor(id));
  const live = $derived(sessions.filter((s) => !s.stop && s.top));
  const best = $derived(live.reduce((a, s) => (!a || s.e1 > a.e1 ? s : a), null));
  const latest = $derived(live.at(-1));
  const gain = $derived(live.length > 1 ? latest.e1 - live[0].e1 : 0);
  const pinned = $derived(ex.pinned ?? []);
  const lastNote = $derived(sessions.findLast((s) => s.note && !s.today));

  let metric = $state('top');
  let picked = $state(null);
  const sel = $derived(picked ?? sessions.length - 1);
  const cur = $derived(sessions[sel]);

  const points = $derived(
    sessions.map((s) => ({
      x: shortDate(s.date),
      value: metric === 'top' ? (s.top?.w ?? 0) : s.e1,
      pr: s.pr,
      stopped: !!s.stop,
    })),
  );
  const stopCount = $derived(sessions.filter((s) => s.stop).length);
  const measure = $derived(metric === 'top' ? 'Top set' : 'Est. 1RM');
  const chartAria = $derived(
    live.length
      ? `${metric === 'top' ? 'Top set weight' : 'Estimated one-rep max'} over ${sessions.length} sessions, from ` +
          `${fmt1(points.find((p) => !p.stopped).value)} to ${fmt1(points.findLast((p) => !p.stopped).value)} pounds` +
          (stopCount ? `, ${stopCount} stop event${stopCount > 1 ? 's' : ''}` : '')
      : '',
  );

  const recent = $derived([...sessions].reverse().slice(0, 4));
  const subs = $derived([
    ...(ex.subs ?? []).map((sid, k) => ({ id: sid, rank: String(k + 1), kind: 'Your pick' })),
    ...(ex.same ?? []).map((sid) => ({ id: sid, rank: '—', kind: 'Same muscle' })),
  ]);

  function setsText(s) {
    return s.sets.map((x) => (x.stopped ? `${fmt1(x.w)}${x.r ? `×${x.r}` : ''} stopped` : `${fmt1(x.w)}×${x.r}`)).join(' · ');
  }

  function stopText(s) {
    const skipped = s.sets.length < (slot?.sets ?? s.sets.length) ? ` · sets ${s.stop.set + 2}–${slot.sets} skipped` : '';
    return `${s.stop.symptom} at ${fmt1(s.stop.w)} lb, set ${s.stop.set + 1}${skipped}`;
  }

  function back() {
    if (history.length > 1) history.back();
    else go('/library');
  }
</script>

<div class="app__scroll app__scroll--roomy">
  <header class="card-top">
    <button class="hr-icon-btn" aria-label="Back" onclick={back}><Icon name="back" /></button>
    <span class="option-text">
      <span class="hr-eyebrow">Exercise library</span>
      <span class="hr-jjk jjk-tight">Inventory</span>
    </span>
  </header>

  <section class="stack">
    <h1 class="title screen-title">{ex.name}</h1>
    <div class="exh-meta-row">
      <span class="hr-tag">{ex.region}</span>
      {#if ex.also}<span class="small muted">Also works {ex.also}</span>{/if}
    </div>
    <div class="stat-row">
      <div class="hr-stat">
        <span class="hr-eyebrow">Best</span>
        {#if best}
          <span class="hr-stat__value">{fmt1(best.top.w)} × {best.top.r}</span>
          <span class="hr-stat__sub" class:sub-flash={best.pr}>{best.pr ? 'PR · ' : ''}{shortDate(best.date)}</span>
        {:else}
          <span class="hr-stat__value">—</span><span class="hr-stat__sub">{lastText(ex)}</span>
        {/if}
      </div>
      <div class="hr-stat">
        <span class="hr-eyebrow">Est. 1RM</span>
        {#if latest}
          <span class="hr-stat__value">{Math.round(latest.e1)} <small>lb</small></span>
          <span class="hr-stat__sub" class:sub-accent={gain > 0}>
            {gain > 0 ? `+${Math.round(gain)}` : Math.round(gain)} since {shortDate(live[0].date)}
          </span>
        {:else}
          <span class="hr-stat__value">—</span><span class="hr-stat__sub">No sessions yet</span>
        {/if}
      </div>
      <div class="hr-stat">
        <span class="hr-eyebrow">Plan</span>
        {#if slot}
          <span class="hr-stat__value">{slot.sets} × {slot.reps}</span>
          <span class="hr-stat__sub">Rest {clock(slot.rest)}</span>
        {:else}
          <span class="hr-stat__value">—</span><span class="hr-stat__sub">Not in program</span>
        {/if}
      </div>
    </div>
  </section>

  {#if ex.media?.length}
    <section class="stack" aria-labelledby="form-h">
      <h2 id="form-h" class="heading screen-title">Form</h2>
      {#each ex.media as m (m.url)}
        <a class="media-link" href={m.url} target="_blank" rel="noopener noreferrer">
          <span class="media-link__icon"><Icon name="external" /></span>
          <span class="option-text">
            <span class="body-strong">{m.label}</span>
            <span class="meta media-link__note">Opens in Brave</span>
          </span>
        </a>
      {/each}
    </section>
  {/if}

  {#if pinned.length || lastNote}
    <section class="stack" aria-labelledby="notes-h">
      <h2 id="notes-h" class="heading screen-title">Notes</h2>
      {#each pinned as note (note.text)}
        <div class="hr-note">
          <span class="hr-note__icon"><Icon name="pin" /></span>
          <span>
            <span class="hr-note__kind">Pinned · {note.kind === 'cap' ? 'load cap' : 'cue'}</span>
            <span class="hr-note__body note-block">{note.text}</span>
            {#if note.kind === 'cap'}<span class="hr-jjk">Binding Vow</span>{/if}
          </span>
        </div>
      {/each}
      {#if lastNote}
        <div class="hr-note hr-note--session">
          <span class="hr-note__icon"><Icon name="note" /></span>
          <span>
            <span class="hr-note__kind">Last session · {shortDate(lastNote.date)}</span>
            <span class="hr-note__body note-block">{lastNote.note}</span>
          </span>
        </div>
      {/if}
    </section>
  {/if}

  <section class="stack" aria-labelledby="history-h">
    <div class="section-head">
      <h2 id="history-h" class="heading screen-title">
        {sessions.length ? `${measure}, last ${sessions.length} session${sessions.length > 1 ? 's' : ''}` : 'History'}
      </h2>
    </div>
    {#if sessions.length}
      <div class="hr-seg" role="group" aria-label="Chart measure">
        <button class="hr-seg__btn" aria-pressed={metric === 'top'} onclick={() => (metric = 'top')}>Top set</button>
        <button class="hr-seg__btn" aria-pressed={metric === 'e1'} onclick={() => (metric = 'e1')}>Est. 1RM</button>
      </div>
      <div class="readout">
        <span class="readout__value hr-num">
          {#if cur.stop}{fmt1(cur.stop.w)}{cur.stop.r ? ` × ${cur.stop.r}` : ' lb'}
          {:else if metric === 'top'}{fmt1(cur.top.w)} × {cur.top.r}
          {:else}{fmt1(cur.e1)} lb{/if}
        </span>
        <span class="small muted">
          {longDate(cur.date)}{cur.today ? ' · today' : ''}{!cur.stop && metric === 'e1' ? ` · from ${fmt1(cur.top.w)} × ${cur.top.r}` : ''}
        </span>
        {#if cur.pr}<span class="hr-pr hr-pr--quiet"><Icon name="bolt" />PR</span>{/if}
        {#if cur.stop}<span class="hr-chip hr-chip--stopped"><Icon name="stop" />Stopped</span>{/if}
      </div>
      <div class="chart-card">
        <LineChart {points} selected={sel} onselect={(i) => (picked = i)} aria={chartAria} />
      </div>
      <div class="chart-key meta">
        <span class="chart-key__item"><span class="key-dot key-dot--pr"></span>PR (Black Flash)</span>
        <span class="chart-key__item"><span class="key-stop"><Icon name="stop" /></span>Stop event</span>
        <span>Tap a point for details</span>
      </div>
    {:else}
      <p class="body muted hint">No sessions logged yet.</p>
    {/if}
  </section>

  {#if recent.length}
    <section class="stack" aria-labelledby="recent-h">
      <h2 id="recent-h" class="heading screen-title">Recent sessions</h2>
      {#each recent as s (s.date)}
        <div class="session-row" class:session-row--stop={s.stop}>
          <div class="section-head">
            <span class="hr-eyebrow eyebrow-strong">{longDate(s.date)}{s.today ? ' · today' : ''}</span>
            {#if s.pr}<span class="hr-pr hr-pr--quiet"><Icon name="bolt" />PR</span>{/if}
            {#if s.stop}<span class="hr-chip hr-chip--stopped"><Icon name="stop" />Stopped</span>{/if}
          </div>
          <span class="option-name hr-num">{setsText(s)}</span>
          {#if s.stop}<span class="meta">{stopText(s)}</span>
          {:else if s.note}<span class="meta">{s.note}</span>{/if}
        </div>
      {/each}
    </section>
  {/if}

  {#if subs.length}
    <section class="stack" aria-labelledby="subs-h">
      <div class="option-text">
        <h2 id="subs-h" class="heading screen-title">Substitutions</h2>
        <span class="hr-jjk">Weapon Swap · first pick shows first when a machine is taken</span>
      </div>
      {#each subs as sub (sub.id)}
        <a class="sub-row" href="#/exercise/{sub.id}">
          <span class="sub-rank" class:sub-rank--pick={sub.rank !== '—'}>{sub.rank}</span>
          <span class="option-text">
            <span class="option-name">{CATALOG[sub.id].name}</span>
            <span class="meta">{sub.kind} · {lastText(CATALOG[sub.id])}</span>
          </span>
          <span class="muted"><Icon name="chevron-right" /></span>
        </a>
      {/each}
    </section>
  {/if}
</div>
