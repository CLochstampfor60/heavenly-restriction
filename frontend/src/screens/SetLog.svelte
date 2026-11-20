<script>
  import Icon from '../components/Icon.svelte';
  import RestTimer from '../components/RestTimer.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Stepper from '../components/Stepper.svelte';
  import { readyToLog } from '../logic.js';
  import { go } from '../router.svelte.js';
  import {
    clock,
    day,
    exerciseFor,
    finishSlot,
    fmt,
    later,
    loggedCount,
    logSet,
    measureFor,
    nextTodo,
    openSwap,
    planText,
    priorFor,
    rest,
    start,
    stopSlot,
    targetText,
    ui,
    undoSet,
  } from '../stores/workout.svelte.js';

  let { slotId } = $props();

  const SYMPTOMS = ['Pinch', 'Sharp pain', 'Numbness or tingling', 'Dull ache', 'Form breaking down', 'Other'];
  const RIR = ['0', '1', '2', '3', '4+'];

  const slot = $derived(day.slots[slotId]);
  const ex = $derived(exerciseFor(slot));
  const position = $derived(day.order.indexOf(slotId) + 1);
  const active = $derived(slot.sets.findIndex((s) => s.status === 'todo'));
  const working = $derived(slot.status === 'active' && active !== -1);
  const lastLogged = $derived(slot.sets.findLastIndex((s) => s.status === 'done' || s.status === 'pr'));
  const prior = $derived(priorFor(ex, Math.max(active, 0), slot));
  const m = $derived(measureFor(slot));
  const timed = $derived(m.measure === 'seconds');
  const side = $derived(m.perSide ? ' / side' : '');
  const wUnit = $derived(m.assisted ? 'lb assist' : 'lb');
  const nUnit = $derived(`${timed ? 's' : 'reps'}${side}`);
  const logged = $derived(loggedCount(slot));
  const canFinish = $derived(working && logged >= slot.plan.setsMin && logged > 0 && logged < slot.sets.length);
  const isPlanned = $derived(ex.id === slot.exerciseId || ex.id === slot.plan.alt);
  // The program's cue for this slot (and any load cap) when doing the planned exercise.
  const pinned = $derived.by(() => {
    const own = ex.pinned ?? [];
    const notes = isPlanned && slot.plan.notes.length ? [...own.filter((p) => p.kind === 'cap'), ...slot.plan.notes] : own;
    return notes.filter((x, k) => notes.findIndex((y) => y.text === x.text) === k);
  });
  const banner = $derived(ui.banner?.slotId === slotId ? ui.banner : null);
  const next = $derived(nextTodo());
  const stopped = $derived(slot.sets.find((s) => s.status === 'stopped'));

  // Edited values for the active set; null means "use last time's value".
  let w = $state(null);
  let n = $state(null); // reps, or seconds for timed sets
  let rir = $state(null);
  const priorN = $derived((timed ? prior.s : prior.r) ?? slot.plan.target.min ?? null);
  const curW = $derived(w ?? prior.w);
  const curN = $derived(n ?? priorN);
  // First time on an exercise there is no weight to offer: it has to be entered.
  const ready = $derived(readyToLog(curW, curN));

  let noteOpen = $state(false);
  let stopOpen = $state(false);
  let symptom = $state(null);
  let stopNote = $state('');

  function log() {
    if (!ready) return;
    logSet(slotId, timed ? { w: curW, s: curN, rir } : { w: curW, r: curN, rir });
    w = null;
    n = null;
    rir = null;
  }

  function doLater() {
    later(slotId);
    go('/');
  }

  function openStop() {
    symptom = null;
    stopNote = '';
    stopOpen = true;
  }

  function confirmStop() {
    stopSlot(slotId, { w: curW, symptom: symptom ?? 'Other', note: stopNote.trim() });
    stopOpen = false;
  }

  function goNext() {
    const id = next; // `next` re-derives as soon as start() runs
    start(id);
    go(`/log/${id}`);
  }
</script>

<div class="app__scroll">
  <header class="hr-exh">
    <div class="exh-row">
      <a href="#/" class="hr-icon-btn" aria-label="Back to today's workout"><Icon name="back" /></a>
      <div class="exh-title">
        <span class="hr-eyebrow">{day.name} · exercise {position} of {day.order.length}</span>
        <h1 class="hr-exh__name"><a class="name-link" href="#/exercise/{ex.id}">{ex.name}</a></h1>
      </div>
      {#if working}
        <button class="hr-stop" onclick={openStop}><Icon name="stop" />Stop</button>
      {/if}
    </div>
    <div class="exh-indent exh-meta-row">
      <span class="hr-tag">{ex.region}</span>
      <span class="hr-exh__meta">{planText(slot)} · rest {clock(slot.plan.rest)}</span>
    </div>
    {#if slot.status === 'active' || slot.status === 'todo'}
      <div class="hr-exh__actions exh-indent">
        <button class="hr-btn hr-btn--ghost hr-btn--compact exh-action" onclick={doLater}>
          <Icon name="later" />Later
        </button>
        {#if !slot.doneAs}
          <button class="hr-btn hr-btn--secondary hr-btn--compact exh-action" onclick={() => openSwap(slotId)}>
            <Icon name="swap" />Swap
          </button>
        {/if}
      </div>
    {/if}
  </header>

  {#if pinned.length}
    <button class="hr-note note-toggle" aria-expanded={noteOpen} onclick={() => (noteOpen = !noteOpen)}>
      <span class="hr-note__icon"><Icon name="pin" /></span>
      <span class="note-text" class:note-text--clamped={!noteOpen}><b>Pinned ·</b>{' '}{pinned.map((p) => p.text).join(' ')}</span>
      <span class="meta-strong">{noteOpen ? 'Less' : 'More'}</span>
    </button>
  {/if}

  {#if banner}
    <div class="hr-pr-banner" role="status">
      <span class="hr-pr-banner__icon"><Icon name="bolt" /></span>
      <span>
        <b>New personal record</b>
        <span class="hr-pr-banner__sub">
          <span class="hr-flash-text">Black Flash</span> · {banner.text}{banner.e1 ? ` · est. 1RM ${banner.e1} lb` : ''}
        </span>
      </span>
    </div>
  {/if}

  <div class="stack" role="list" aria-label="Sets">
    {#each slot.sets as set, k (k)}
      {@const isActive = working && k === active}
      {@const todo = set.status === 'todo'}
      {@const p = priorFor(ex, k, slot)}
      {@const pN = (timed ? p.s : p.r) ?? slot.plan.target.min}
      {@const logged = set.status === 'done' || set.status === 'pr'}
      <div
        role="listitem"
        class="hr-set"
        class:hr-set--active={isActive}
        class:hr-set--done={set.status === 'done'}
        class:hr-set--pr={set.status === 'pr'}
        class:hr-set--skipped={set.status === 'skipped'}
        class:hr-set--stopped={set.status === 'stopped'}
      >
        <span class="hr-set__n hr-num">
          {#if set.status === 'stopped'}
            <span role="img" aria-label="Stopped"><Icon name="stop" /></span>
          {:else}{k + 1}{/if}
        </span>
        {#if todo}
          <span class="hr-set__v hr-set__v--faded">{fmt(p.w)}<small>{wUnit}</small></span>
          <span class="hr-set__v hr-set__v--faded">{fmt(pN)}<small>{nUnit}</small></span>
        {:else if set.status === 'skipped'}
          <span class="hr-set__v">—</span>
          <span class="hr-set__v">Skipped</span>
        {:else if set.status === 'stopped'}
          <span class="hr-set__v">{fmt(set.w)}<small>{wUnit}</small></span>
          <span class="hr-set__v set-v-stopped">Stopped</span>
        {:else}
          <span class="hr-set__v">{fmt(set.w)}<small>{wUnit}</small></span>
          <span class="hr-set__v">{fmt(timed ? set.s : set.r)}<small>{nUnit}</small></span>
        {/if}

        {#if isActive}
          <button
            class="hr-set__check"
            aria-label={ready
              ? `Log set ${k + 1} with ${w === null && n === null ? 'last time’s values, ' : ''}${fmt(curW)} pounds${m.assisted ? ' of assistance' : ''} for ${fmt(curN)} ${timed ? 'seconds' : 'reps'}${side ? ' each side' : ''}`
              : `Set ${k + 1}: enter the ${curW == null ? 'weight' : timed ? 'seconds' : 'reps'} first`}
            disabled={!ready}
            onclick={log}
          >
            <span class="hr-box"></span>
          </button>
        {:else if logged}
          {@const undoable = k === lastLogged && slot.status !== 'stopped'}
          <button
            class="hr-set__check"
            aria-label="Set {k + 1} done{set.status === 'pr' ? ', personal record' : ''}{undoable ? ', tap to undo' : ''}"
            disabled={!undoable}
            onclick={() => undoSet(slotId, k)}
          >
            <span class="hr-box"><Icon name={set.status === 'pr' ? 'bolt' : 'check'} /></span>
          </button>
        {:else if todo}
          <span class="hr-set__check set-check-idle" aria-hidden="true"><span class="hr-box"></span></span>
        {:else}
          <span></span>
        {/if}
      </div>
    {/each}
  </div>
</div>

<div class="app__bar app__bar--log">
  {#if working}
    {#if rest.running}
      <RestTimer target={slot.plan.rest} />
    {/if}
    <div class="stepper-pair">
      <Stepper
        label={m.assisted ? 'Assist · lb · less is better' : 'Weight · lb'}
        value={w}
        placeholder={prior.w}
        step={2.5}
        inputmode="decimal"
        ariaLabel="{m.assisted ? 'Assistance' : 'Weight'} in pounds for set {active + 1}, last time {fmt(prior.w)}"
        decLabel="Decrease {m.assisted ? 'assistance' : 'weight'} by 2.5 pounds"
        incLabel="Increase {m.assisted ? 'assistance' : 'weight'} by 2.5 pounds"
        onchange={(v) => (w = v)}
      />
      <Stepper
        label="{timed ? 'Seconds' : 'Reps'} · target {isPlanned ? targetText(slot.plan) : 'any'}"
        value={n}
        placeholder={priorN}
        step={timed ? 5 : 1}
        inputmode="numeric"
        ariaLabel="{timed ? 'Seconds' : 'Reps'}{side ? ' each side' : ''} for set {active + 1}, last time {fmt(priorN)}"
        decLabel="Decrease {timed ? 'seconds by 5' : 'reps'}"
        incLabel="Increase {timed ? 'seconds by 5' : 'reps'}"
        onchange={(v) => (n = v === null ? null : Math.round(v))}
      />
    </div>
    <div class="rir-row" role="group" aria-label="Reps in reserve, optional">
      <span class="option-text">
        <span class="hr-eyebrow rir-label">RIR</span>
        <span class="meta">optional</span>
      </span>
      <div class="hr-rir__cells">
        {#each RIR as label, k (label)}
          <button
            class="hr-rir__cell"
            aria-pressed={rir === k}
            aria-label="{label} reps in reserve"
            onclick={() => (rir = rir === k ? null : k)}>{label}</button
          >
        {/each}
      </div>
    </div>
    <button class="hr-btn hr-btn--primary hr-btn--hero" onclick={log} disabled={!ready}>
      {#if ready}<Icon name="check" />Log set {active + 1}
      {:else}Enter {curW == null ? (m.assisted ? 'assistance' : 'weight') : timed ? 'seconds' : 'reps'} for set {active + 1}{/if}
    </button>
    {#if canFinish}
      <button class="hr-btn hr-btn--secondary" onclick={() => finishSlot(slotId)}>
        Finish after {logged} sets
      </button>
    {/if}
  {:else if slot.status === 'todo'}
    <button class="hr-btn hr-btn--primary hr-btn--hero" onclick={() => start(slotId)}>
      Start this exercise
    </button>
  {:else}
    <div class="finish-line">
      {#if stopped}
        <span class="hr-chip hr-chip--stopped"><Icon name="stop" />Stopped</span>
        <span class="small muted">{stopped.symptom} at {fmt(stopped.w)} {wUnit}, set {slot.sets.indexOf(stopped) + 1}</span>
      {:else}
        <span class="hr-chip hr-chip--done"><Icon name="check" />Done</span>
        <span class="small muted">{logged} set{logged === 1 ? '' : 's'} logged</span>
      {/if}
    </div>
    {#if next}
      <button class="hr-btn hr-btn--primary hr-btn--hero" onclick={goNext}>
        Next: {exerciseFor(day.slots[next]).name}
      </button>
    {:else}
      <a href="#/" class="hr-btn hr-btn--primary hr-btn--hero"><Icon name="back" />Back to today</a>
    {/if}
  {/if}
</div>

{#if stopOpen}
  <Sheet label="Stop exercise" stop onclose={() => (stopOpen = false)}>
    <div class="stack-tight">
      <span class="hr-eyebrow eyebrow-stop">Stop exercise</span>
      <h2 class="hr-sheet__title">What happened?</h2>
    </div>
    <div class="symptoms">
      {#each SYMPTOMS as label (label)}
        <button class="symptom" aria-pressed={symptom === label} onclick={() => (symptom = label)}>
          {#if symptom === label}<Icon name="check" />{/if}{label}
        </button>
      {/each}
    </div>
    <div class="stop-summary">
      <span class="hr-eyebrow">Saved with it</span>
      <span class="heading hr-num">{ex.name} · set {active + 1} · {fmt(curW)} {wUnit}</span>
      <span class="meta">Shows on this exercise's history and the calendar.</span>
    </div>
    <div class="stack-tight">
      <label for="stop-note" class="hr-eyebrow">Note · optional</label>
      <input id="stop-note" class="text-field" type="text" placeholder="Where, and how it felt" bind:value={stopNote}>
    </div>
    <div class="stop-actions">
      <button class="hr-btn hr-btn--secondary" onclick={() => (stopOpen = false)}>Cancel</button>
      <button class="hr-stop hr-stop--solid" onclick={confirmStop}><Icon name="stop" />Stop and record</button>
    </div>
  </Sheet>
{/if}
