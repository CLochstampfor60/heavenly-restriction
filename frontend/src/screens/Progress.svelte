<script>
  import BarChart from '../components/BarChart.svelte';
  import Icon from '../components/Icon.svelte';
  import LineChart, { fmt1 } from '../components/LineChart.svelte';
  import Nav from '../components/Nav.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Stepper from '../components/Stepper.svelte';
  import { dateKey } from '../db.js';
  import { CATALOG } from '../fixtures/demo.js';
  import { HISTORY } from '../fixtures/history.js';
  import { calendarStatus, MUSCLE_SETS, SERIES, SETS_TARGET, YEAR_END } from '../fixtures/progress.js';
  import { longDate, sessionsFor, shortDate } from '../stores/history.js';
  import { source } from '../stores/source.svelte.js';
  import { cachedGet } from '../stores/sync.svelte.js';
  import { bodySeries, lastKnown, loadMetrics, metrics, removeMetrics, saveMetrics } from '../stores/metrics.svelte.js';
  import { dayStatus, fmt, setText } from '../stores/workout.svelte.js';

  // Demo mode draws everything from the made-up fixtures; real mode from /api/progress.
  const sessionsOf = (id) => sessionsFor(id);
  let api = $state(null);
  let apiStatus = $state(source.demo ? 'demo' : 'loading');
  if (!source.demo) {
    cachedGet(`/api/progress?date=${dateKey()}`)
      .then(({ data }) => {
        api = data;
        apiStatus = 'ready';
        loadMetrics(data.body_entries ?? []);
      })
      .catch(() => {
        apiStatus = 'error';
        loadMetrics([]); // still show what this phone saved
      });
  }
  const real = $derived(!source.demo && api);

  const now = new Date();
  const todayKey = dateKey(now);
  const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DEMO_STRENGTH = [1, 2, 4, 5, 6]; // Mon, Tue, Thu, Fri, Sat
  const GRADES = ['Grade 4', 'Grade 3', 'Grade 2', 'Grade 1', 'Special Grade'];

  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  // Lifting days by JS weekday (0 = Sunday); the API counts from Monday.
  const STRENGTH = $derived(real ? api.lifting_weekdays.map((wd) => (wd + 1) % 7) : DEMO_STRENGTH);
  const realStatus = $derived(
    real ? { ...api.calendar, ...Object.fromEntries(api.week.map((w) => [w.date, w.status])) } : {},
  );
  const statusOn = (d) => {
    const key = dateKey(d);
    if (key === todayKey) return dayStatus(); // this phone's copy of today is the freshest
    if (key > todayKey) return null;
    return real ? (realStatus[key] ?? null) : calendarStatus(key);
  };

  // Real-mode series, shaped like the demo SERIES; a range with no points is left out.
  const monthTitle = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  function realSeries(a) {
    const rng = (pts, title) => (pts?.length ? { title, pts, goal: false } : undefined);
    const body = (base, kind) => {
      const data = bodySeries(kind, now);
      return {
        ...base,
        goal: null,
        goalLabel: '',
        ranges: { month: rng(data.month, monthTitle), year: rng(data.year, 'Last 12 months · monthly average') },
      };
    };
    return {
      body: body(SERIES.body, 'bodyweight'),
      waist: body(SERIES.waist, 'waist'),
      lift: {
        tab: 'Lift',
        icon: 'dumbbell',
        name: a.lift?.name ?? 'Your most-logged lift',
        unit: a.lift ? (a.lift.assisted ? 'lb assist' : a.lift.unit) : 'lb',
        goal: null,
        goalLabel: '',
        ranges: { month: rng(a.lift?.month, monthTitle), year: rng(a.lift?.year, 'Last 12 months · best per month') },
      },
      cardio: {
        ...SERIES.cardio,
        goal: a.cardio.target,
        goalLabel: `Target ${a.cardio.target}`,
        ranges: {
          week: { title: `Week of ${shortDate(dateKey(monday))}`, goal: false, pts: a.cardio.week },
          month: rng(a.cardio.month, `${monthTitle} · per week`),
          year: rng(a.cardio.year, 'Last 12 months · weekly average'),
        },
      },
    };
  }
  const S = $derived(real ? realSeries(api) : SERIES);
  const attended = (s) => s === 'done' || s === 'partial' || s === 'stop';

  // ---------- This week ----------
  const week = $derived(
    STRENGTH.map((wd) => {
      const d = addDays(monday, (wd + 6) % 7);
      return { name: DAY_NAMES[wd], status: statusOn(d), future: dateKey(d) > todayKey };
    }),
  );
  const weekDone = $derived(week.filter((w) => attended(w.status)).length);
  const weekNote = $derived.by(() => {
    const skipped = week.filter((w) => w.status === 'skip').map((w) => w.name);
    return skipped.length ? `${skipped.join(', ')} skipped` : 'None skipped';
  });
  const cardioWeek = $derived(S.cardio.ranges.week.pts);
  const cardioDone = $derived(cardioWeek.reduce((a, p) => a + p[1], 0));
  const cardioPlanned = $derived.by(() => {
    const planned = cardioWeek.map((p, k) => [p[2], k]).filter(([v]) => v);
    if (!planned.length) return null;
    if (planned.length === 1) return `${planned[0][0]} min planned ${DAY_NAMES[(planned[0][1] + 1) % 7]}`;
    return `${planned.reduce((a, [v]) => a + v, 0)} min still planned`;
  });

  // ---------- Measurement chart ----------
  let metric = $state('body');
  let range = $state('month');
  let picked = $state(null);

  const liftMonth = $derived.by(() => {
    if (real) return { pts: [] }; // real mode: the API's month series is used instead
    const month = todayKey.slice(0, 7);
    const pts = sessionsOf(SERIES.lift.exercise)
      .filter((s) => s.date.startsWith(month))
      .map((s) => [shortDate(s.date), s.stop ? s.stop.w : s.e1, s.stop ? 'stop' : null]);
    return { title: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), pts };
  });
  const m = $derived(S[metric]);
  const ranges = $derived(
    ['week', 'month', 'year'].filter(
      (id) => m.ranges[id] || (metric === 'lift' && id === 'month' && liftMonth.pts.length),
    ),
  );
  // Falls back to the first range on offer (the lift has no Month view in a month without sessions).
  const r = $derived(
    metric === 'lift' && range === 'month' && liftMonth.pts.length
      ? liftMonth
      : (m.ranges[range] ?? m.ranges[ranges[0]] ?? { title: 'No entries yet', pts: [], goal: false }),
  );
  const isBars = $derived(metric === 'cardio');
  const goal = $derived(r.goal === false || m.goal == null ? null : { value: m.goal, label: m.goalLabel });
  const sel = $derived(picked !== null && picked < r.pts.length ? picked : r.pts.length - 1);
  const cur = $derived(r.pts[sel]);
  const live = $derived(r.pts.filter((p) => p[2] !== 'stop'));
  const first = $derived(live[0]?.[1] ?? 0);
  const last = $derived(live.at(-1)?.[1] ?? 0);

  function pickMetric(id) {
    metric = id;
    range = 'month';
    picked = null;
  }

  function pickRange(id) {
    range = id;
    picked = null;
  }

  const linePoints = $derived(r.pts.map((p) => ({ x: p[0], value: p[1], stopped: p[2] === 'stop' })));
  const barPoints = $derived(r.pts.map((p) => ({ x: p[0], value: p[1], planned: p[2] })));
  const delta = $derived(last - first);

  const readValue = $derived.by(() => {
    if (!cur) return '';
    if (isBars) return `${cur[1]} min`;
    if (cur[2] === 'stop') return `${fmt1(cur[1])} lb`;
    return `${fmt1(cur[1])} ${m.unit}`;
  });
  const readDetail = $derived.by(() => {
    if (!cur) return '';
    if (isBars) {
      if (range === 'week') {
        return cur[2] ? `${cur[2]} min planned` : `${cardioDone} of ${m.goal} min this week`;
      }
      return `${range === 'year' ? (cur[3] ?? yearMonth(sel)) : `week of ${cur[0]}`} · target ${m.goal} a week`;
    }
    if (cur[2] === 'stop') return `${cur[0]} · stop event`;
    const change = Math.abs(delta) < 0.05 ? 'no change' : `${delta < 0 ? '−' : '+'}${fmt1(Math.abs(delta))} ${m.unit}`;
    return `${range === 'year' ? (cur[3] ?? yearMonth(sel)) : cur[0]} · ${change} over the period`;
  });

  // Year views hold one point per month, ending with YEAR_END; the axis shows only initials.
  function yearMonth(i) {
    const end = new Date(YEAR_END[0], YEAR_END[1] - 1, 1);
    const d = new Date(end.getFullYear(), end.getMonth() - (r.pts.length - 1 - i), 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  const chartFoot = $derived.by(() => {
    if (isBars) {
      return range === 'week'
        ? 'Every cardio day counts toward the weekly target.'
        : `Weeks at or above the gold line met the ${m.goal}-minute target.`;
    }
    if (m.goal == null) return 'Tap a point for its value.';
    return `${fmt1(Math.abs(last - m.goal))} ${m.unit} to ${m.goalLabel.toLowerCase()}. Tap a point for its value.`;
  });
  const chartAria = $derived(
    `${m.name}, ${r.title}, from ${fmt1(first)} to ${fmt1(last)} ${m.unit}` + (goal ? `, goal ${m.goal}` : ''),
  );

  // ---------- Records and calendar ----------
  const records = $derived(
    real
      ? api.records.map((x) => ({
          id: x.exercise_id,
          name: x.name,
          detail: `${setText({ assisted: x.assisted, measure: x.measure }, x.set, x.per_side)} · ${longDate(x.date)}`,
          grade: null,
          level: 0,
        }))
      : Object.keys(HISTORY)
      .map((id) => ({ id, s: sessionsOf(id).findLast((x) => x.pr) }))
      .filter((x) => x.s)
      .sort((a, b) => (a.s.date < b.s.date ? 1 : -1))
      .map(({ id, s }) => ({
        id,
        name: CATALOG[id].name,
        detail: `${fmt1(s.top.w)} × ${s.top.r} · ${longDate(s.date)}`,
        grade: CATALOG[id].grade,
        level: GRADES.indexOf(CATALOG[id].grade) + 1,
      })),
  );
  const prDays = $derived(
    real
      ? new Set(api.pr_days)
      : new Set(Object.keys(HISTORY).flatMap((id) => sessionsOf(id).filter((s) => s.pr).map((s) => s.date))),
  );
  const muscleSets = $derived(real ? api.muscle_sets : MUSCLE_SETS);

  const monthName = now.toLocaleDateString('en-US', { month: 'long' });
  const days = $derived.by(() => {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const count = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const blanks = Array.from({ length: (firstDay.getDay() + 6) % 7 }, () => null);
    const cells = Array.from({ length: count }, (_, k) => {
      const d = addDays(firstDay, k);
      const key = dateKey(d);
      return { n: k + 1, key, status: statusOn(d), today: key === todayKey, pr: prDays.has(key), weekday: d.getDay() };
    });
    return [...blanks, ...cells];
  });
  const sessionDays = $derived(
    days.filter((d) => d && STRENGTH.includes(d.weekday) && d.key <= todayKey && d.status !== null),
  );
  const monthAttended = $derived(sessionDays.filter((d) => attended(d.status)).length);

  // ---------- Log bodyweight and waist (real mode) ----------
  let logOpen = $state(false);
  let logDate = $state(todayKey);
  let bw = $state(null);
  let waist = $state(null);
  const entry = $derived(metrics.byDate[logDate] ?? null);

  function pickDate(d) {
    logDate = d && d <= todayKey ? d : todayKey;
    bw = metrics.byDate[logDate]?.bodyweight ?? null;
    waist = metrics.byDate[logDate]?.waist ?? null;
  }

  function openLog() {
    pickDate(todayKey);
    logOpen = true;
  }

  function saveLog() {
    saveMetrics(logDate, bw, waist);
    logOpen = false;
  }

  function deleteLog() {
    removeMetrics(logDate);
    logOpen = false;
  }

  const STATUS = {
    done: { icon: 'check', word: 'done' },
    partial: { icon: 'partial', word: 'partial' },
    skip: { icon: 'skip', word: 'skipped' },
    stop: { icon: 'stop', word: 'stop event' },
    cardio: { icon: 'pulse', word: 'cardio' },
    rest: { icon: 'moon', word: 'recovery' },
  };
</script>

<div class="app__scroll app__scroll--roomy">
  <header class="stack-tight">
    <span class="hr-eyebrow">{longDate(todayKey)} · week of {shortDate(dateKey(monday))}</span>
    <h1 class="title screen-title">Progress</h1>
    {#if apiStatus === 'loading'}
      <span class="meta" role="status">Loading your progress…</span>
    {:else if apiStatus === 'error'}
      <p class="hr-exrow__note sample-note">Can't load progress without a connection. Today's session still counts below.</p>
    {/if}
  </header>

  <section class="week-cards" aria-label="This week">
    <div class="week-card">
      <span class="hr-eyebrow">Sessions</span>
      <span class="week-card__value hr-num">{weekDone} <small>of {week.length}</small></span>
      <div class="session-meter" aria-hidden="true">
        {#each week as w (w.name)}
          <span class="session-meter__seg" class:session-meter__seg--done={attended(w.status)}></span>
        {/each}
      </div>
      <span class="meta">{weekNote}</span>
    </div>
    <div class="week-card">
      <span class="hr-eyebrow eyebrow-icon"><span class="recover-ink"><Icon name="pulse" /></span>Cardio</span>
      <span class="week-card__value hr-num">{cardioDone} <small>/ {S.cardio.goal} min</small></span>
      <div
        class="hr-meter hr-meter--recover"
        role="progressbar"
        aria-label="Cardio minutes this week"
        aria-valuemin="0"
        aria-valuemax={S.cardio.goal}
        aria-valuenow={cardioDone}
      >
        <div class="hr-meter__fill" style:width="{Math.min(100, (cardioDone / (S.cardio.goal || 1)) * 100)}%"></div>
      </div>
      <span class="meta">{cardioPlanned ?? 'Nothing planned'}</span>
    </div>
  </section>

  <section class="stack" aria-label="Measurements">
    <div class="metric-tabs" role="tablist" aria-label="Measurement">
      {#each Object.entries(S) as [id, s] (id)}
        <button
          class="metric-tab"
          class:metric-tab--recover={id === 'cardio'}
          role="tab"
          aria-selected={metric === id}
          onclick={() => pickMetric(id)}
        >
          <Icon name={s.icon} />{s.tab}
        </button>
      {/each}
    </div>
    <div class="chart-panel">
      {#if ranges.length > 1}
        <div class="hr-seg" role="group" aria-label="Time range">
          {#each ranges as id (id)}
            <button class="hr-seg__btn" aria-pressed={range === id} onclick={() => pickRange(id)}>
              {id[0].toUpperCase() + id.slice(1)}
            </button>
          {/each}
        </div>
      {/if}
      <span class="body-strong period-title">{r.title}</span>
      {#if !r.pts.length}
        <span class="hr-eyebrow">{m.name}</span>
        <p class="body muted hint">
          {metric === 'body' || metric === 'waist' ? 'No measurements logged yet.' : 'Nothing logged in this period yet.'}
        </p>
        {#if real && (metric === 'body' || metric === 'waist')}
          <button class="hr-btn hr-btn--primary" onclick={openLog}><Icon name={m.icon} />Log weight and waist</button>
        {/if}
      {:else}
      <div class="stack-tight">
        <span class="hr-eyebrow">{m.name}</span>
        <span class="readout">
          <span class="readout__value hr-num">{readValue}</span>
          <span class="small muted">{readDetail}</span>
          {#if cur?.[2] === 'stop'}<span class="hr-chip hr-chip--stopped"><Icon name="stop" />Stopped</span>{/if}
        </span>
      </div>
      {#if isBars}
        <BarChart points={barPoints} selected={sel} onselect={(i) => (picked = i)} {goal} aria={chartAria} />
      {:else}
        <LineChart points={linePoints} selected={sel} onselect={(i) => (picked = i)} {goal} area aria={chartAria} />
      {/if}
      <span class="meta">{chartFoot}</span>
      {#if real && (metric === 'body' || metric === 'waist')}
        <button class="hr-btn hr-btn--secondary" onclick={openLog}><Icon name={m.icon} />Log weight and waist</button>
      {/if}
      {/if}
    </div>
  </section>

  <section class="stack" aria-labelledby="muscles-h">
    <div class="section-head">
      <h2 id="muscles-h" class="heading screen-title">Sets per muscle group</h2>
      <span class="meta">This week</span>
    </div>
    {#each muscleSets as [name, sets] (name)}
      <div class="muscle-row">
        <span class="small muscle-row__name">{name}</span>
        <span class="muscle-bar" role="img" aria-label="{name}: {sets} sets, target {SETS_TARGET}">
          <span class="muscle-bar__fill" style:width="{Math.min(100, (sets / (SETS_TARGET * 2)) * 100)}%"></span>
          <span class="muscle-bar__tick"></span>
        </span>
        <span class="muscle-row__n hr-num">{sets}</span>
      </div>
    {:else}
      <p class="body muted hint">No sets logged this week yet.</p>
    {/each}
    <span class="meta eyebrow-icon"><span class="tick-key"></span>Target: at least {SETS_TARGET} sets</span>
  </section>

  <section class="stack" aria-labelledby="cal-h">
    <div class="section-head">
      <h2 id="cal-h" class="heading screen-title">{monthName}</h2>
      <span class="meta">{monthAttended} of {sessionDays.length} sessions</span>
    </div>
    <div class="hr-cal">
      {#each WEEKDAYS as wd, k (k)}<span class="hr-eyebrow cal-head">{wd}</span>{/each}
      {#each days as d, k (k)}
        {#if d}
          <span
            class="hr-day"
            class:hr-day--done={d.status === 'done'}
            class:hr-day--partial={d.status === 'partial'}
            class:hr-day--skip={d.status === 'skip'}
            class:hr-day--stop={d.status === 'stop'}
            class:hr-day--cardio={d.status === 'cardio'}
            class:hr-day--rest={d.status === 'rest'}
            class:hr-day--today={d.today}
            role="img"
            aria-label="{monthName} {d.n}{d.today ? ', today' : ''}{d.status ? `, ${STATUS[d.status].word}` : ''}{d.pr ? ', personal record' : ''}"
          >
            <span class="hr-day__n">{d.n}</span>
            {#if d.status}<Icon name={STATUS[d.status].icon} />{/if}
            {#if d.pr}<span class="hr-day__pr"></span>{/if}
          </span>
        {:else}
          <span></span>
        {/if}
      {/each}
    </div>
    <div class="cal-legend meta">
      {#each Object.entries(STATUS) as [id, s] (id)}
        <span class="eyebrow-icon cal-legend__item cal-legend__item--{id}"><Icon name={s.icon} />{s.word[0].toUpperCase() + s.word.slice(1)}</span>
      {/each}
      <span class="eyebrow-icon"><span class="key-dot key-dot--pr"></span>Personal record</span>
    </div>
  </section>

  <section class="stack" aria-labelledby="records-h">
    <div class="option-text">
      <h2 id="records-h" class="heading screen-title">Recent records</h2>
      <span class="hr-jjk">Black Flash</span>
    </div>
    {#each records as rec (rec.id)}
      <a class="sub-row record-row" href="#/exercise/{rec.id}">
        <span class="record-row__icon"><Icon name="bolt" /></span>
        <span class="option-text">
          <span class="option-name">{rec.name}</span>
          <span class="meta">{rec.detail}</span>
        </span>
        {#if rec.grade}
          <span class="record-row__grade">
            <span class="hr-grade">{rec.grade}</span>
            <span class="meta">Level {rec.level} of 5</span>
          </span>
        {/if}
      </a>
    {:else}
      <p class="body muted hint">No records yet. A record needs a session to beat.</p>
    {/each}
  </section>
</div>
<Nav current="progress" />

{#if logOpen}
  <Sheet label="Log weight and waist" onclose={() => (logOpen = false)}>
    <div class="stack-tight">
      <span class="hr-eyebrow">Body measurements</span>
      <h2 class="hr-sheet__title">{entry ? 'Edit' : 'Log'} weight and waist</h2>
    </div>
    <div class="stack-tight">
      <label for="metric-date" class="hr-eyebrow">Date</label>
      <input
        id="metric-date"
        class="text-field"
        type="date"
        max={todayKey}
        value={logDate}
        onchange={(e) => pickDate(e.currentTarget.value)}
      >
      <span class="meta">{entry ? 'Editing the entry for this day.' : 'No entry for this day yet.'}</span>
    </div>
    <div class="stepper-pair">
      <Stepper
        label="Bodyweight · lb"
        value={bw}
        placeholder={lastKnown('bodyweight', logDate)}
        step={0.2}
        inputmode="decimal"
        ariaLabel="Bodyweight in pounds"
        decLabel="Decrease bodyweight by 0.2 pounds"
        incLabel="Increase bodyweight by 0.2 pounds"
        onchange={(v) => (bw = v === null ? null : Math.round(v * 10) / 10)}
      />
      <Stepper
        label="Waist · in"
        value={waist}
        placeholder={lastKnown('waist', logDate)}
        step={0.5}
        inputmode="decimal"
        ariaLabel="Waist in inches, at the navel"
        decLabel="Decrease waist by half an inch"
        incLabel="Increase waist by half an inch"
        onchange={(v) => (waist = v === null ? null : Math.round(v * 100) / 100)}
      />
    </div>
    <span class="meta">Leave a field empty to skip it. Last value shown faded{bw === null && waist === null ? '' : `: saving ${[bw !== null && `${fmt(bw)} lb`, waist !== null && `${fmt(waist)} in`].filter(Boolean).join(' and ')}`}.</span>
    <div class="sheet-actions">
      {#if entry}
        <button class="hr-btn hr-btn--secondary" onclick={deleteLog}>Delete entry</button>
      {:else}
        <button class="hr-btn hr-btn--secondary" onclick={() => (logOpen = false)}>Cancel</button>
      {/if}
      <button class="hr-btn hr-btn--primary" disabled={bw === null && waist === null && !entry} onclick={saveLog}>
        <Icon name="check" />Save
      </button>
    </div>
  </Sheet>
{/if}
