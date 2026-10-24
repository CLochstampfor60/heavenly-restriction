<script>
  import BarChart from '../components/BarChart.svelte';
  import Icon from '../components/Icon.svelte';
  import LineChart, { fmt1 } from '../components/LineChart.svelte';
  import Nav from '../components/Nav.svelte';
  import { dateKey } from '../db.js';
  import { CATALOG } from '../fixtures/demo.js';
  import { HISTORY } from '../fixtures/history.js';
  import { calendarStatus, MUSCLE_SETS, SERIES, SETS_TARGET, YEAR_END } from '../fixtures/progress.js';
  import { longDate, sessionsFor, shortDate } from '../stores/history.js';
  import { dayStatus } from '../stores/workout.svelte.js';

  const now = new Date();
  const todayKey = dateKey(now);
  const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const STRENGTH = [1, 2, 4, 5, 6]; // Mon, Tue, Thu, Fri, Sat
  const GRADES = ['Grade 4', 'Grade 3', 'Grade 2', 'Grade 1', 'Special Grade'];

  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  const statusOn = (d) => {
    const key = dateKey(d);
    if (key === todayKey) return dayStatus();
    return key < todayKey ? calendarStatus(key) : null;
  };
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
  const cardioWeek = SERIES.cardio.ranges.week.pts;
  const cardioDone = cardioWeek.reduce((a, p) => a + p[1], 0);
  const plannedIdx = cardioWeek.findIndex((p) => p[2]);
  const cardioPlanned = plannedIdx === -1 ? null : `${cardioWeek[plannedIdx][2]} min planned ${DAY_NAMES[(plannedIdx + 1) % 7]}`;

  // ---------- Measurement chart ----------
  let metric = $state('body');
  let range = $state('month');
  let picked = $state(null);

  const liftMonth = $derived.by(() => {
    const month = todayKey.slice(0, 7);
    const pts = sessionsFor(SERIES.lift.exercise)
      .filter((s) => s.date.startsWith(month))
      .map((s) => [shortDate(s.date), s.stop ? s.stop.w : s.e1, s.stop ? 'stop' : null]);
    return { title: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), pts };
  });
  const m = $derived(SERIES[metric]);
  const ranges = $derived(
    ['week', 'month', 'year'].filter(
      (id) => m.ranges[id] || (metric === 'lift' && id === 'month' && liftMonth.pts.length),
    ),
  );
  // Falls back to the first range on offer (the lift has no Month view in a month without sessions).
  const r = $derived(
    metric === 'lift' && range === 'month' && liftMonth.pts.length
      ? liftMonth
      : (m.ranges[range] ?? m.ranges[ranges[0]]),
  );
  const isBars = $derived(metric === 'cardio');
  const goal = $derived(r.goal === false ? null : { value: m.goal, label: m.goalLabel });
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
    if (isBars) return `${cur[1]} min`;
    if (cur[2] === 'stop') return `${fmt1(cur[1])} lb`;
    return `${fmt1(cur[1])} ${m.unit}`;
  });
  const readDetail = $derived.by(() => {
    if (isBars) {
      if (range === 'week') {
        return cur[2] ? `${cur[2]} min planned` : `${cardioDone} of ${m.goal} min this week`;
      }
      return `${range === 'year' ? yearMonth(sel) : `week of ${cur[0]}`} · target ${m.goal} a week`;
    }
    if (cur[2] === 'stop') return `${cur[0]} · stop event`;
    const change = Math.abs(delta) < 0.05 ? 'no change' : `${delta < 0 ? '−' : '+'}${fmt1(Math.abs(delta))} ${m.unit}`;
    return `${range === 'year' ? yearMonth(sel) : cur[0]} · ${change} over the period`;
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
    return `${fmt1(Math.abs(last - m.goal))} ${m.unit} to ${m.goalLabel.toLowerCase()}. Tap a point for its value.`;
  });
  const chartAria = $derived(
    `${m.name}, ${r.title}, from ${fmt1(first)} to ${fmt1(last)} ${m.unit}` + (goal ? `, goal ${m.goal}` : ''),
  );

  // ---------- Records and calendar ----------
  const records = $derived(
    Object.keys(HISTORY)
      .map((id) => ({ id, s: sessionsFor(id).findLast((x) => x.pr) }))
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
    new Set(Object.keys(HISTORY).flatMap((id) => sessionsFor(id).filter((s) => s.pr).map((s) => s.date))),
  );

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
      <span class="week-card__value hr-num">{cardioDone} <small>/ {SERIES.cardio.goal} min</small></span>
      <div
        class="hr-meter hr-meter--recover"
        role="progressbar"
        aria-label="Cardio minutes this week"
        aria-valuemin="0"
        aria-valuemax={SERIES.cardio.goal}
        aria-valuenow={cardioDone}
      >
        <div class="hr-meter__fill" style:width="{Math.min(100, (cardioDone / SERIES.cardio.goal) * 100)}%"></div>
      </div>
      <span class="meta">{cardioPlanned ?? 'Nothing planned'}</span>
    </div>
  </section>

  <section class="stack" aria-label="Measurements">
    <div class="metric-tabs" role="tablist" aria-label="Measurement">
      {#each Object.entries(SERIES) as [id, s] (id)}
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
      <div class="stack-tight">
        <span class="hr-eyebrow">{m.name}</span>
        <span class="readout">
          <span class="readout__value hr-num">{readValue}</span>
          <span class="small muted">{readDetail}</span>
          {#if cur[2] === 'stop'}<span class="hr-chip hr-chip--stopped"><Icon name="stop" />Stopped</span>{/if}
        </span>
      </div>
      {#if isBars}
        <BarChart points={barPoints} selected={sel} onselect={(i) => (picked = i)} {goal} aria={chartAria} />
      {:else}
        <LineChart points={linePoints} selected={sel} onselect={(i) => (picked = i)} {goal} area aria={chartAria} />
      {/if}
      <span class="meta">{chartFoot}</span>
    </div>
  </section>

  <section class="stack" aria-labelledby="muscles-h">
    <div class="section-head">
      <h2 id="muscles-h" class="heading screen-title">Sets per muscle group</h2>
      <span class="meta">This week</span>
    </div>
    {#each MUSCLE_SETS as [name, sets] (name)}
      <div class="muscle-row">
        <span class="small muscle-row__name">{name}</span>
        <span class="muscle-bar" role="img" aria-label="{name}: {sets} sets, target {SETS_TARGET}">
          <span class="muscle-bar__fill" style:width="{Math.min(100, (sets / (SETS_TARGET * 2)) * 100)}%"></span>
          <span class="muscle-bar__tick"></span>
        </span>
        <span class="muscle-row__n hr-num">{sets}</span>
      </div>
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
    {/each}
  </section>
</div>
<Nav current="progress" />
