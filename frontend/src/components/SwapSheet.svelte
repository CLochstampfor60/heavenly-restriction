<script>
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import { closeSwap, day, exerciseFor, pickSwap, swapGroups, ui } from '../stores/workout.svelte.js';

  const slot = $derived(ui.swapFor ? day.slots[ui.swapFor] : null);
</script>

{#if slot}
  {@const ex = exerciseFor(slot)}
  <Sheet label={`Swap ${ex.name}`} onclose={closeSwap}>
    <div class="stack-tight">
      <span class="hr-eyebrow">{ex.region}</span>
      <h2 class="hr-sheet__title">Swap {ex.name}</h2>
      <span class="hr-jjk">Weapon Swap</span>
    </div>
    {#each swapGroups(slot) as group (group.label)}
      <div class="stack">
        <span class="hr-eyebrow">{group.label}</span>
        {#each group.options as option (option.id)}
          <button class="hr-sheet__option" onclick={() => pickSwap(option.id)}>
            <span class="option-text">
              <span class="option-name">{option.name}</span>
              <span class="meta">{option.meta}</span>
            </span>
            <span class="muted"><Icon name="chevron-right" /></span>
          </button>
        {/each}
      </div>
    {/each}
    <button class="hr-btn hr-btn--secondary" onclick={closeSwap}>Cancel</button>
  </Sheet>
{/if}
