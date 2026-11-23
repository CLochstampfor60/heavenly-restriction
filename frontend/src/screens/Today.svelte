<script>
  import Icon from '../components/Icon.svelte';
  import Nav from '../components/Nav.svelte';
  import SaveStatus from '../components/SaveStatus.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { finishMessage, finishPrompt } from '../logic.js';
  import { setDemo } from '../mode.js';
  import { go } from '../router.svelte.js';
  import { source } from '../stores/source.svelte.js';
  import {
    blockLabel,
    day,
    exerciseFor,
    finishAndSync,
    firstUnfinishedId,
    lastText,
    later,
    loggedCount,
    markCardio,
    markItem,
    openSlots,
    openSwap,
    planText,
    requiredIds,
    slotNote,
    toggleGear,
    undoStop,
  } from '../stores/workout.svelte.js';

  const date = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const required = $derived(requiredIds());
  const total = $derived(required.length);
  const doneCount = $derived(required.filter((id) => day.slots[id].status === 'done').length);
  const begun = $derived(
    day.order.some((id) => day.slots[id].status !== 'todo') || day.cardio.some((c) => c.status !== 'todo'),
  );
  const brought = $derived(Object.keys(day.gear).filter((g) => day.gear[g]));

  // Program order by block; cardio goes after the forearm block, before the cool-down; anything
  // moved to Later comes last.
  const groups = $derived.by(() => {
    const out = [];
    let cardioPlaced = !day.cardio.length;
    const placeCardio = () => {
      if (!cardioPlaced) out.push({ key: 'cardio', label: blockLabel('cardio'), ids: [] });
      cardioPlaced = true;
    };
    for (const id of day.order) {
      const slot = day.slots[id];
      const key = slot.later ? 'later' : slot.plan.block;
      if (key === 'cooldown' || key === 'later') placeCardio();
      if (out.at(-1)?.key !== key) out.push({ key, label: key === 'later' ? 'Later' : blockLabel(key), ids: [] });
      out.at(-1).ids.push(id);
    }
    placeCardio();
    return out;
  });

  // Start workout / Continue open the pager at the first exercise not yet ended; with every
  // required exercise ended, the button finishes the workout.
  const ENDED = ['done', 'stopped', 'skipped'];
  const hero = $derived.by(() => {
    if (day.finished || !day.order.length) return null;
    if (!required.every((id) => ENDED.includes(day.slots[id].status))) {
      const id = firstUnfinishedId();
      const name = day.slots[id] ? exerciseFor(day.slots[id]).name : day.cardio.find((c) => c.id === id)?.mode;
      return { icon: null, label: begun ? `Continue: ${name}` : 'Start workout', slot: id };
    }
    return { icon: 'check', label: 'Finish workout', slot: null };
  });

  // Set when Finish workout has forced a sync: what reached the server.
  let finishText = $state('');

  function cardioMeta(c) {
    const parts = [`${c.minutes} min`];
    if (c.settings.incline != null) parts.push(`incline ${c.settings.incline}`);
    if (c.settings.speed_mph != null) parts.push(`${c.settings.speed_mph} mph`);
    if (c.settings.note) parts.push(c.settings.note);
    return parts.join(' · ');
  }

  // Finish is reachable once the workout has begun. With exercises still open it asks first.
  let confirm = $state(null);

  function askFinish() {
    const open = openSlots();
    const partial = open.end.map((id) => exerciseFor(day.slots[id]).name);
    confirm = finishPrompt(open, partial);
    if (!confirm) finishWorkout();
  }

  async function finishWorkout() {
    confirm = null;
    finishText = 'Saving…';
    const result = await finishAndSync();
    finishText = source.demo ? 'Demo data: nothing is sent to the server.' : finishMessage(result);
  }

  function heroAction() {
    if (!hero.slot) return askFinish();
    go(`/log/${hero.slot}`);
  }
</script>

<div class="app__scroll">
  <header class="stack-tight">
    <div class="screen-top">
      <span class="hr-eyebrow">{date}{day.version ? ` · program ${day.version}` : ''}</span>
      <a href="#/settings" class="hr-icon-btn screen-top__btn" aria-label="Settings"><Icon name="more" /></a>
    </div>
    <h1 class="title screen-title">Today's workout{day.name ? `: ${day.name}` : ''}</h1>
    <span class="hr-jjk">Today's Mission</span>
    {#if total}
      <div class="day-progress">
        <div
          class="hr-meter day-progress__meter"
          role="progressbar"
          aria-label="Exercises finished"
          aria-valuemin="0"
          aria-valuemax={total}
          aria-valuenow={doneCount}
        >
          <div class="hr-meter__fill" style:width="{(doneCount / total) * 100}%"></div>
        </div>
        <span class="small muted hr-num">{doneCount} of {total} done</span>
      </div>
    {/if}
    <SaveStatus />
    {#if source.cached}<span class="meta">Showing the program saved on this phone</span>{/if}
  </header>

  {#if source.status === 'error'}
    <section class="stack">
      <p class="body">Can't reach the server, and this phone has no saved copy of today's program yet.</p>
      <button class="hr-btn hr-btn--primary" onclick={() => location.reload()}>Try again</button>
      <button class="hr-btn hr-btn--secondary" onclick={() => setDemo(true)}>Use demo data</button>
    </section>
  {:else if source.status === 'empty'}
    <section class="stack">
      <p class="body">No program has been imported yet. Run the importer on the server (see the README), then reload.</p>
      <button class="hr-btn hr-btn--secondary" onclick={() => setDemo(true)}>Use demo data</button>
    </section>
  {:else}
    <section class="stack" aria-label="What I brought today">
      <button class="gear-head" aria-expanded={day.gearOpen} onclick={() => (day.gearOpen = !day.gearOpen)}>
        <span class="option-text">
          <span class="body-strong">What I brought today</span>
          <span class="meta">{brought.length ? brought.join(', ') : 'Nothing extra'}</span>
        </span>
        <span class="meta-strong">{day.gearOpen ? 'Done' : 'Edit'}</span>
      </button>
      {#if day.gearOpen}
        {#each Object.keys(day.gear) as item (item)}
          <button class="hr-toggle" role="switch" aria-checked={day.gear[item]} onclick={() => toggleGear(item)}>
            <span>{item}</span><span class="hr-toggle__switch"></span>
          </button>
        {/each}
      {/if}
    </section>

    {#each groups as group (group.key)}
      <section class="stack" aria-label={group.label}>
        <span class="hr-eyebrow block-head">{group.label}</span>
        <div class="stack" role="list">
          {#if group.key === 'cardio'}
            {#each day.cardio as c (c.id)}
              <div role="listitem" class="hr-exrow" class:hr-exrow--done={c.status === 'done'}>
                <span class="hr-exrow__mark" aria-hidden="true"><Icon name={c.status === 'done' ? 'check' : 'pulse'} /></span>
                <a class="hr-exrow__body exrow-open" href="#/log/{c.id}">
                  <span class="hr-exrow__name">{c.mode}</span>
                  <span class="hr-exrow__meta">{cardioMeta(c)}</span>
                </a>
                {@render ticks(c.status, c.mode, (status) => markCardio(c.id, status))}
              </div>
            {/each}
          {/if}
          {#each group.ids as id (id)}
            {@const slot = day.slots[id]}
            {@const ex = exerciseFor(slot)}
            {@const note = slotNote(slot)}
            {@const isDone = slot.status === 'done'}
            {@const isSwap = note?.kind === 'info' && !isDone}
            {@const sets = loggedCount(slot)}
            {@const checklist = !slot.plan.loggable}
            {@const going = slot.status === 'active'}
            <div
              role="listitem"
              class="hr-exrow"
              class:hr-exrow--done={isDone}
              class:hr-exrow--current={going}
              class:hr-exrow--swap={isSwap && !going}
            >
              <span class="hr-exrow__mark" aria-hidden="true">
                {#if isDone}<Icon name="check" />
                {:else if slot.status === 'stopped'}<Icon name="stop" />
                {:else if slot.status === 'skipped'}<Icon name="skip" />
                {:else if going}<Icon name="partial" />
                {:else if isSwap}<Icon name="swap" />
                {:else if slot.plan.block === 'cooldown'}<Icon name="moon" />
                {:else}{slot.plan.code}{/if}
              </span>
              <a class="hr-exrow__body exrow-open" href="#/log/{id}">
                <span class="hr-exrow__name">{ex.name}</span>
                {#if !checklist}<span class="hr-tag exrow-tag">{ex.region}</span>{/if}
                <span class="hr-exrow__meta">
                  {slot.plan.optional ? 'Optional · ' : ''}{planText(slot)}{#if !checklist}{' · '}{sets ? `${sets} of ${slot.plan.sets} sets` : lastText(ex)}{/if}
                </span>
                {#if note}
                  <span class={note.kind === 'info' ? 'hr-exrow__note' : 'hr-exrow__meta'}>{note.text}</span>
                {/if}
              </a>
              {#if checklist}
                {@render ticks(slot.status, ex.name, (status) => markItem(id, status))}
              {:else if isDone}
                <span class="hr-chip hr-chip--done"><Icon name="check" />Done</span>
              {:else if slot.status === 'stopped'}
                <button class="hr-btn hr-btn--secondary hr-btn--compact exrow-undo" onclick={() => undoStop(id)}>Undo stop</button>
              {:else}
                <span class="hr-exrow__actions">
                  {#if !slot.plan.optional && !slot.later}
                    <button class="hr-icon-btn muted" aria-label="Do {ex.name} later" onclick={() => later(id)}>
                      <Icon name="later" />
                    </button>
                  {/if}
                  {#if !slot.doneAs}
                    <button class="hr-icon-btn" aria-label="Swap {ex.name}" onclick={() => openSwap(id)}>
                      <Icon name="swap" />
                    </button>
                  {/if}
                </span>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}
    {#if day.order.length}
      <p class="meta hint">Tap any exercise to log it, in any order. Later moves one to the bottom. Swap picks another for the same muscle. Optional work never counts as missed.</p>
    {:else}
      <p class="body muted hint">Nothing planned today.</p>
    {/if}
  {/if}
</div>

{#snippet ticks(status, name, mark)}
  {#if status === 'done'}
    <button class="chip-btn" aria-label="{name} done, tap to undo" onclick={() => mark('done')}>
      <span class="hr-chip hr-chip--done"><Icon name="check" />Done</span>
    </button>
  {:else if status === 'skipped'}
    <button class="chip-btn" aria-label="{name} skipped, tap to undo" onclick={() => mark('skipped')}>
      <span class="hr-chip"><Icon name="skip" />Skipped</span>
    </button>
  {:else}
    <span class="hr-exrow__actions">
      <button class="hr-icon-btn muted" aria-label="Skip {name}" onclick={() => mark('skipped')}><Icon name="skip" /></button>
      <button class="hr-icon-btn" aria-label="Mark {name} done" onclick={() => mark('done')}><Icon name="check" /></button>
    </span>
  {/if}
{/snippet}

<div class="app__bar">
  {#if hero}
    <button class="hr-btn hr-btn--primary hr-btn--compact" onclick={heroAction}>
      {#if hero.icon}<Icon name={hero.icon} />{/if}{hero.label}
    </button>
    {#if hero.slot && begun}
      <button class="hr-btn hr-btn--secondary hr-btn--compact" onclick={askFinish}><Icon name="check" />Finish workout</button>
    {/if}
  {:else if day.finished}
    <div class="finish-line">
      <span class="hr-chip hr-chip--done"><Icon name="check" />Done</span>
      <span class="small muted" role="status">{finishText || 'Workout finished'}</span>
    </div>
  {/if}
</div>
<Nav current="today" />

{#if confirm}
  <Sheet label="Finish workout" onclose={() => (confirm = null)}>
    <div class="stack-tight">
      <span class="hr-eyebrow">Finish workout</span>
      <h2 class="hr-sheet__title">{confirm.title}</h2>
    </div>
    <p class="body hint">{confirm.question}</p>
    {#if confirm.keeps}<p class="meta hint">{confirm.keeps}</p>{/if}
    <div class="sheet-actions">
      <button class="hr-btn hr-btn--secondary" onclick={() => (confirm = null)}>Cancel</button>
      <button class="hr-btn hr-btn--primary" onclick={finishWorkout}><Icon name="check" />Finish</button>
    </div>
  </Sheet>
{/if}
