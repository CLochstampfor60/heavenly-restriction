<script>
  import Icon from '../components/Icon.svelte';
  import Nav from '../components/Nav.svelte';
  import { go } from '../router.svelte.js';
  import {
    activeSlotId,
    day,
    exerciseFor,
    finish,
    lastText,
    later,
    loggedCount,
    nextTodo,
    openSwap,
    planText,
    slotNote,
    start,
    toggleGear,
  } from '../stores/workout.svelte.js';

  const date = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const total = $derived(day.order.length);
  const doneCount = $derived(day.order.filter((id) => day.slots[id].status === 'done').length);
  const activeId = $derived(activeSlotId());
  const todoId = $derived(nextTodo());
  const begun = $derived(day.order.some((id) => day.slots[id].status !== 'todo'));
  const brought = $derived(Object.keys(day.gear).filter((g) => day.gear[g]));

  const hero = $derived.by(() => {
    if (day.finished) return null;
    if (activeId) return { icon: null, label: `Continue: ${exerciseFor(day.slots[activeId]).name}`, slot: activeId };
    if (todoId) {
      const label = begun ? `Next: ${exerciseFor(day.slots[todoId]).name}` : 'Start workout';
      return { icon: null, label, slot: todoId };
    }
    return { icon: 'check', label: 'Finish workout', slot: null };
  });

  function heroAction() {
    const id = hero.slot; // `hero` re-derives as soon as start() runs
    if (!id) return finish();
    start(id);
    go(`/log/${id}`);
  }
</script>

<div class="app__scroll">
  <header class="stack-tight">
    <span class="hr-eyebrow">{date} · program {day.version}</span>
    <h1 class="title screen-title">Today's workout: {day.name}</h1>
    <span class="hr-jjk">Today's Mission</span>
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
  </header>

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

  <div class="stack" role="list" aria-label="Exercises in program order">
    {#each day.order as id, k (id)}
      {@const slot = day.slots[id]}
      {@const ex = exerciseFor(slot)}
      {@const note = slotNote(slot)}
      {@const isDone = slot.status === 'done'}
      {@const isSwap = note?.kind === 'info' && !isDone}
      {@const sets = loggedCount(slot)}
      <div
        role="listitem"
        class="hr-exrow"
        class:hr-exrow--done={isDone}
        class:hr-exrow--current={slot.status === 'active'}
        class:hr-exrow--swap={isSwap && slot.status !== 'active'}
      >
        <span class="hr-exrow__mark" aria-hidden="true">
          {#if isDone}<Icon name="check" />
          {:else if slot.status === 'stopped'}<Icon name="stop" />
          {:else if isSwap}<Icon name="swap" />
          {:else}{k + 1}{/if}
        </span>
        <span class="hr-exrow__body">
          <span class="hr-exrow__name">{ex.name}</span>
          <span class="hr-tag exrow-tag">{ex.region}</span>
          <span class="hr-exrow__meta">
            {planText(slot)} · {sets && !isDone ? `${sets} of ${slot.plan.sets} sets` : lastText(ex)}
          </span>
          {#if note}
            <span class={note.kind === 'info' ? 'hr-exrow__note' : 'hr-exrow__meta'}>{note.text}</span>
          {/if}
        </span>
        {#if isDone}
          <span class="hr-chip hr-chip--done"><Icon name="check" />Done</span>
        {:else if slot.status === 'stopped'}
          <span class="hr-chip hr-chip--stopped"><Icon name="stop" />Stopped</span>
        {:else if slot.status === 'active'}
          <a href="#/log/{id}" class="hr-btn hr-btn--primary hr-btn--compact exrow-continue">Continue</a>
        {:else}
          <span class="hr-exrow__actions">
            <button class="hr-icon-btn muted" aria-label="Do {ex.name} later" onclick={() => later(id)}>
              <Icon name="later" />
            </button>
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
  <p class="meta hint">Later moves an exercise to the bottom. Swap picks another for the same muscle.</p>
</div>

<div class="app__bar">
  {#if hero}
    <button class="hr-btn hr-btn--primary hr-btn--hero" onclick={heroAction}>
      {#if hero.icon}<Icon name={hero.icon} />{/if}{hero.label}
    </button>
  {:else}
    <div class="finish-line">
      <span class="hr-chip hr-chip--done"><Icon name="check" />Done</span>
      <span class="small muted">Workout finished</span>
    </div>
  {/if}
</div>
<Nav current="today" />
