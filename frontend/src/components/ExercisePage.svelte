<script>
  // One exercise's page in the pager: header, pinned note, set rows, and the logging bar.
  import Icon from './Icon.svelte';
  import RestTimer from './RestTimer.svelte';
  import SaveStatus from './SaveStatus.svelte';
  import Sheet from './Sheet.svelte';
  import Stepper from './Stepper.svelte';
  import { readyToLog } from '../logic.js';
  import {
    addSet,
    blockLabel,
    canRemoveSet,
    clock,
    day,
    exerciseFor,
    finishSlot,
    fmt,
    loggedCount,
    logSet,
    measureFor,
    openSwap,
    planText,
    plannedSets,
    priorFor,
    removeSet,
    rest,
    restFor,
    restMode,
    stopSlot,
    targetText,
    toggleRestToday,
    ui,
    undoSet,
    undoStop,
  } from '../stores/workout.svelte.js';

  let { slotId, current } = $props();

  const SYMPTOMS = ['Pinch', 'Sharp pain', 'Numbness or tingling', 'Dull ache', 'Form breaking down', 'Other'];
  const RIR = ['0', '1', '2', '3', '4+'];

  const slot = $derived(day.slots[slotId]);
  const ex = $derived(exerciseFor(slot));
  const initials = $derived(
    ex.name
      .split(/[\s-]+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join(''),
  );
  // The set the next Log set fills: the first planned set to do (a skipped one counts, since
  // logging reopens the exercise), else an extra one at the end.
  const active = $derived.by(() => {
    const k = slot.sets.findIndex((s) => s.status === 'todo' || s.status === 'skipped');
    return k === -1 ? slot.sets.length : k;
  });
  const planned = $derived(plannedSets(slot));
  const extra = $derived(active >= planned);
  const lastLogged = $derived(slot.sets.findLastIndex((s) => s.status === 'done' || s.status === 'pr'));
  const prior = $derived(priorFor(ex, active, slot));
  const m = $derived(measureFor(slot));
  const timed = $derived(m.measure === 'seconds');
  const side = $derived(m.perSide ? ' / side' : '');
  const wUnit = $derived(m.assisted ? 'lb assist' : 'lb');
  const nUnit = $derived(`${timed ? 's' : 'reps'}${side}`);
  const logged = $derived(loggedCount(slot));
  const canFinish = $derived(
    slot.status === 'active' && logged >= slot.plan.setsMin && logged > 0 && logged < planned,
  );
  const isPlanned = $derived(ex.id === slot.exerciseId || ex.id === slot.plan.alt);
  // The program's cue for this slot (and any load cap) when doing the planned exercise.
  const pinned = $derived.by(() => {
    const own = ex.pinned ?? [];
    const notes = isPlanned && slot.plan.notes.length ? [...own.filter((p) => p.kind === 'cap'), ...slot.plan.notes] : own;
    return notes.filter((x, k) => notes.findIndex((y) => y.text === x.text) === k);
  });
  const banner = $derived(ui.banner?.slotId === slotId ? ui.banner : null);
  const stopped = $derived(slot.sets.find((s) => s.status === 'stopped'));
  const restOn = $derived(restMode() !== 'off');

  // Edited values for the next set; null means "use last time's value".
  let w = $state(null);
  let n = $state(null); // reps, or seconds for timed sets
  let rir = $state(null);
  let rirOpen = $state(false);
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
    rirOpen = false;
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
</script>

<div class="app__scroll pager-body">
  <header class="hr-exh">
    <div class="page-head">
      <span class="media-ph hr-num" aria-hidden="true">{initials}</span>
      <div class="exh-title">
        <span class="hr-eyebrow">{blockLabel(slot.plan.block)}{slot.plan.optional ? ' · optional' : ''}</span>
        <h1 class="hr-exh__name"><a class="name-link" href="#/exercise/{ex.id}">{ex.name}</a></h1>
      </div>
      {#if slot.status !== 'stopped'}
        <button class="hr-stop" onclick={openStop}><Icon name="stop" />Stop</button>
      {/if}
    </div>
    <div class="exh-meta-row">
      <span class="hr-tag">{ex.region}</span>
      <span class="hr-exh__meta">{planText(slot)} · rest {clock(restFor(slot))}</span>
      <!-- Today only; Settings > Workout keeps the default. The word says the state, not the color. -->
      <button
        class="hr-btn hr-btn--compact exh-action rest-toggle"
        class:hr-btn--secondary={restOn}
        class:hr-btn--ghost={!restOn}
        aria-label="Rest timer {restOn ? 'on' : 'off'}"
        onclick={toggleRestToday}
      >
        <Icon name="timer" />Timer {restOn ? 'on' : 'off'}
      </button>
    </div>
    <SaveStatus />
    <div class="exh-meta-row page-status">
      {#if slot.status === 'done'}
        <span class="hr-chip hr-chip--done"><Icon name="check" />Done</span>
      {:else if slot.status === 'stopped'}
        <span class="hr-chip hr-chip--stopped"><Icon name="stop" />Stopped</span>
      {:else if slot.status === 'skipped'}
        <span class="hr-chip"><Icon name="skip" />Skipped</span>
      {/if}
      <span class="small muted hr-num">{logged} of {planned} sets</span>
      {#if !slot.doneAs}
        <button class="hr-btn hr-btn--secondary hr-btn--compact exh-action" onclick={() => openSwap(slotId)}>
          <Icon name="swap" />Swap
        </button>
      {/if}
    </div>
    {#if stopped}
      <div class="exh-meta-row">
        <span class="small muted stop-line">Stopped: {stopped.symptom} at {fmt(stopped.w)} {wUnit}, set {slot.sets.indexOf(stopped) + 1}</span>
        <button class="hr-btn hr-btn--secondary hr-btn--compact exh-action" onclick={() => undoStop(slotId)}>Undo stop</button>
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
      {@const isActive = k === active}
      {@const todo = set.status === 'todo' || isActive}
      {@const p = priorFor(ex, k, slot)}
      {@const pN = (timed ? p.s : p.r) ?? slot.plan.target.min}
      {@const isLog = set.status === 'done' || set.status === 'pr'}
      {@const removable = slot.plan.loggable && canRemoveSet(slot.sets, k)}
      <div
        role="listitem"
        class="hr-set"
        class:set-removable={removable}
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
        {#if removable}
          <!-- Today only; left of the values, away from the one-tap Log check. -->
          <button class="hr-icon-btn set-remove" aria-label="Remove set {k + 1}" onclick={() => removeSet(slotId, k)}>
            <span class="set-remove__dot"><Icon name="minus" /></span>
          </button>
        {/if}
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
        {:else if isLog}
          {@const undoable = k === lastLogged}
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
  {#if slot.plan.loggable}
    <!-- Today only: the program is unchanged. The new set is prefilled like any other. -->
    <button class="hr-btn hr-btn--secondary hr-btn--compact add-set" onclick={() => addSet(slotId)}>
      <Icon name="plus" />Add set
    </button>
  {/if}
</div>

<div class="app__bar app__bar--log">
  {#if current && rest.running}
    <RestTimer />
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
  {#if rirOpen}
    <div class="rir-row hr-rir" role="group" aria-label="Reps in reserve, optional">
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
  {/if}
  <div class="log-row">
    {#if !rirOpen}
      <button class="hr-btn hr-btn--ghost hr-btn--compact rir-open" aria-expanded="false" onclick={() => (rirOpen = true)}>
        RIR{rir != null ? ` ${RIR[rir]}` : ''}
      </button>
    {/if}
    <button class="hr-btn hr-btn--primary hr-btn--hero log-btn" onclick={log} disabled={!ready}>
      {#if ready}<Icon name="check" />Log {extra ? 'extra ' : ''}set {active + 1}
      {:else}Enter {curW == null ? (m.assisted ? 'assistance' : 'weight') : timed ? 'seconds' : 'reps'} for set {active + 1}{/if}
    </button>
  </div>
  {#if canFinish}
    <button class="hr-btn hr-btn--secondary hr-btn--compact" onclick={() => finishSlot(slotId)}>
      Finish after {logged} sets
    </button>
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
      <span class="meta">Shows on this exercise's history and the calendar. Only for symptoms: to move on, just swipe.</span>
    </div>
    <div class="stack-tight">
      <label for="stop-note-{slotId}" class="hr-eyebrow">Note · optional</label>
      <input id="stop-note-{slotId}" class="text-field" type="text" placeholder="Where, and how it felt" bind:value={stopNote}>
    </div>
    <div class="sheet-actions">
      <button class="hr-btn hr-btn--secondary" onclick={() => (stopOpen = false)}>Cancel</button>
      <button class="hr-stop hr-stop--solid" onclick={confirmStop}><Icon name="stop" />Stop and record</button>
    </div>
  </Sheet>
{/if}
