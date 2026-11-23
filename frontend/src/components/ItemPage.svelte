<script>
  // A pager page that is ticked rather than logged set by set: warm-up and cool-down items,
  // program lines with no set count, and cardio.
  import Icon from './Icon.svelte';
  import RestTimer from './RestTimer.svelte';
  import SaveStatus from './SaveStatus.svelte';
  import { blockLabel, day, exerciseFor, markCardio, markItem, planText, rest } from '../stores/workout.svelte.js';

  let { page, current } = $props();

  const cardio = $derived(page.kind === 'cardio' ? day.cardio.find((c) => c.id === page.id) : null);
  const slot = $derived(page.kind === 'slot' ? day.slots[page.id] : null);
  const name = $derived(cardio ? cardio.mode : exerciseFor(slot).name);
  const status = $derived(cardio ? cardio.status : slot.status);
  const eyebrow = $derived(cardio ? blockLabel('cardio') : `${blockLabel(slot.plan.block)}${slot.plan.optional ? ' · optional' : ''}`);
  const icon = $derived(cardio ? 'pulse' : slot.plan.block === 'cooldown' ? 'moon' : 'check');
  const meta = $derived.by(() => {
    if (!cardio) return planText(slot);
    const parts = [`${cardio.minutes} min`];
    if (cardio.settings.incline != null) parts.push(`incline ${cardio.settings.incline}`);
    if (cardio.settings.speed_mph != null) parts.push(`${cardio.settings.speed_mph} mph`);
    if (cardio.settings.note) parts.push(cardio.settings.note);
    return parts.join(' · ');
  });
  const notes = $derived(slot?.plan.notes ?? []);

  function mark(value) {
    if (cardio) markCardio(cardio.id, value);
    else markItem(slot.id, value);
  }
</script>

<div class="app__scroll pager-body">
  <header class="hr-exh">
    <div class="page-head">
      <span class="media-ph" class:media-ph--recover={!!cardio} aria-hidden="true"><Icon name={icon} /></span>
      <div class="exh-title">
        <span class="hr-eyebrow">{eyebrow}</span>
        <h1 class="hr-exh__name">{name}</h1>
      </div>
    </div>
    {#if meta}<span class="hr-exh__meta">{meta}</span>{/if}
    <SaveStatus />
    <div class="exh-meta-row page-status">
      {#if status === 'done'}
        <span class="hr-chip hr-chip--done"><Icon name="check" />Done</span>
      {:else if status === 'skipped'}
        <span class="hr-chip"><Icon name="skip" />Skipped</span>
      {:else}
        <span class="small muted">Not ticked yet</span>
      {/if}
    </div>
  </header>
  {#each notes as note (note.text)}
    <div class="hr-note">
      <span class="hr-note__icon"><Icon name="pin" /></span>
      <span class="hr-note__body">{note.text}</span>
    </div>
  {/each}
</div>

<div class="app__bar app__bar--log">
  {#if current && rest.running}
    <RestTimer />
  {/if}
  <div class="sheet-actions">
    <button class="hr-btn hr-btn--secondary" aria-pressed={status === 'skipped'} onclick={() => mark('skipped')}>
      <Icon name="skip" />{status === 'skipped' ? 'Undo skip' : 'Skip'}
    </button>
    <button class="hr-btn hr-btn--primary hr-btn--hero" aria-pressed={status === 'done'} onclick={() => mark('done')}>
      <Icon name="check" />{status === 'done' ? 'Undo done' : 'Done'}
    </button>
  </div>
</div>
