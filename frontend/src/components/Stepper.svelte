<script>
  import Icon from './Icon.svelte';
  import { fmt } from '../stores/workout.svelte.js';

  // value is null until edited; the placeholder (last time's value) is what gets logged then.
  let { label, value, placeholder, step, inputmode, ariaLabel, decLabel, incLabel, onchange } = $props();
  const current = $derived(value ?? placeholder);

  function typed(event) {
    const v = Number.parseFloat(event.currentTarget.value);
    onchange(Number.isNaN(v) ? null : Math.max(0, v));
  }
</script>

<div class="hr-stepper">
  <span class="hr-eyebrow">{label}</span>
  <span class="hr-stepper__box">
    <button class="hr-stepper__step" aria-label={decLabel} onclick={() => onchange(Math.max(0, current - step))}>
      <Icon name="minus" />
    </button>
    <input
      {inputmode}
      placeholder={fmt(placeholder)}
      value={value === null ? '' : fmt(value)}
      onchange={typed}
      aria-label={ariaLabel}
    >
    <button class="hr-stepper__step" aria-label={incLabel} onclick={() => onchange(current + step)}>
      <Icon name="plus" />
    </button>
  </span>
</div>
