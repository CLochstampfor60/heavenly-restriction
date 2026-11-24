<script>
  // A pager page that is ticked rather than logged set by set: warm-up and cool-down items,
  // program lines with no set count, and cardio.
  import Icon from './Icon.svelte';
  import RestTimer from './RestTimer.svelte';
  import SaveStatus from './SaveStatus.svelte';
  import Stepper from './Stepper.svelte';
  import { CARDIO_TYPES, cardioText } from '../logic.js';
  import { blockLabel, day, exerciseFor, markCardio, markItem, planText, rest, setCardio } from '../stores/workout.svelte.js';

  // Cardio fields: label, step, keyboard. Values round to the step's precision.
  const FIELDS = {
    minutes: { label: 'Minutes', step: 1, inputmode: 'numeric', words: 'minutes', places: 0 },
    incline: { label: 'Incline', step: 0.5, inputmode: 'decimal', words: 'incline', places: 1 },
    mph: { label: 'Speed · mph', step: 0.1, inputmode: 'decimal', words: 'miles per hour', places: 1 },
    level: { label: 'Level', step: 1, inputmode: 'numeric', words: 'level', places: 0 },
  };
  const round = (v, places) => (v == null ? null : Number(v.toFixed(places)));

  let { page, current } = $props();

  const cardio = $derived(page.kind === 'cardio' ? day.cardio.find((c) => c.id === page.id) : null);
  const slot = $derived(page.kind === 'slot' ? day.slots[page.id] : null);
  const name = $derived(cardio ? cardio.mode : exerciseFor(slot).name);
  const status = $derived(cardio ? cardio.status : slot.status);
  const eyebrow = $derived(cardio ? blockLabel('cardio') : `${blockLabel(slot.plan.block)}${slot.plan.optional ? ' · optional' : ''}`);
  const icon = $derived(cardio ? 'pulse' : slot.plan.block === 'cooldown' ? 'moon' : 'check');
  const meta = $derived.by(() => {
    if (!cardio) return planText(slot);
    const parts = [`Plan: ${cardio.minutes} min`];
    if (cardio.settings.incline != null) parts.push(`incline ${cardio.settings.incline}`);
    if (cardio.settings.speed_mph != null) parts.push(`${cardio.settings.speed_mph} mph`);
    if (cardio.settings.note) parts.push(cardio.settings.note);
    return parts.join(' · ');
  });
  const type = $derived(cardio ? (CARDIO_TYPES.find((t) => t.id === cardio.log.type) ?? CARDIO_TYPES[2]) : null);
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
        <span class="small muted">{cardio ? 'Not logged yet' : 'Not ticked yet'}</span>
      {/if}
      {#if cardio && status === 'done'}<span class="small muted hr-num">{cardioText(cardio.log)}</span>{/if}
    </div>
  </header>
  {#if cardio}
    <!-- What was actually done: prefilled from the program, so Done is one tap. -->
    <section class="stack" aria-labelledby="cardio-type-{cardio.id}">
      <span id="cardio-type-{cardio.id}" class="hr-eyebrow">Type</span>
      <div class="hr-seg cardio-type" role="group" aria-labelledby="cardio-type-{cardio.id}">
        {#each CARDIO_TYPES as t (t.id)}
          <button class="hr-seg__btn" aria-pressed={cardio.log.type === t.id} onclick={() => setCardio(cardio.id, 'type', t.id)}>
            {t.label}
          </button>
        {/each}
      </div>
      <div class="stepper-pair">
        {#each type.fields as f (f)}
          {@const F = FIELDS[f]}
          <Stepper
            label={F.label}
            value={cardio.log[f]}
            placeholder={null}
            step={F.step}
            inputmode={F.inputmode}
            ariaLabel="{F.label}{cardio.log[f] == null ? ', not set' : ''}"
            decLabel="Less {F.words}"
            incLabel="More {F.words}"
            onchange={(v) => setCardio(cardio.id, f, round(v, F.places))}
          />
        {/each}
      </div>
    </section>
  {/if}
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
    <button
      class="hr-btn hr-btn--secondary"
      aria-pressed={status === 'skipped'}
      aria-label="{status === 'skipped' ? 'Undo skip' : 'Skip'} {name}"
      onclick={() => mark('skipped')}
    >
      <Icon name="skip" />{status === 'skipped' ? 'Undo skip' : 'Skip'}
    </button>
    <button class="hr-btn hr-btn--primary hr-btn--hero" aria-pressed={status === 'done'} onclick={() => mark('done')}>
      <Icon name="check" />{status === 'done' ? 'Undo done' : 'Done'}
    </button>
  </div>
</div>
