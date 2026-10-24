<script>
  import { addRest, clock, rest, restLeft, skipRest } from '../stores/workout.svelte.js';

  let { target } = $props();
  const RING = 2 * Math.PI * 13;

  $effect(() => {
    if (!rest.running) return;
    const tick = setInterval(() => {
      rest.now = Date.now();
    }, 250);
    return () => clearInterval(tick);
  });

  const left = $derived(restLeft());
  const done = $derived(left === 0);

  // One short buzz at zero; never a sound.
  $effect(() => {
    if (done && !rest.buzzed) {
      rest.buzzed = true;
      navigator.vibrate?.(200);
    }
  });
</script>

<div
  class="hr-timer"
  class:hr-timer--done={done}
  role="timer"
  aria-label={done ? 'Rest done' : `Rest, ${Math.floor(left / 60)} minutes ${left % 60} seconds left`}
>
  <svg class="hr-timer__ring" viewBox="0 0 32 32" aria-hidden="true">
    <circle class="hr-track" cx="16" cy="16" r="13"></circle>
    <circle
      class="hr-prog"
      cx="16"
      cy="16"
      r="13"
      stroke-dasharray={RING}
      stroke-dashoffset={done ? 0 : RING * (1 - left / rest.total)}
    ></circle>
  </svg>
  <span class="hr-timer__grow">
    <span class="hr-timer__time">{clock(left)}</span>
    <span class="hr-timer__label">{done ? 'Rest done · go' : `Rest · target ${clock(target)}`}</span>
  </span>
  <button class="hr-btn hr-btn--ghost hr-btn--compact timer-btn" aria-label="Add 15 seconds" onclick={() => addRest(15)}>+15 s</button>
  <button class="hr-btn hr-btn--ghost hr-btn--compact timer-btn" onclick={skipRest}>Skip</button>
</div>
