<script>
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import { libraryRegions } from '../logic.js';
  import { loadLibrary } from '../stores/source.svelte.js';
  import { closeSwap, day, exerciseFor, lastText, pickFromLibrary, pickSwap, swapGroups, ui } from '../stores/workout.svelte.js';

  const slot = $derived(ui.swapFor ? day.slots[ui.swapFor] : null);

  // "All exercises": the whole library (cached, so it works with no signal), grouped by region.
  let library = $state(null); // rows, once loaded
  let failed = $state(false);
  let query = $state('');
  let open = $state({}); // region name -> expanded

  $effect(() => {
    if (!slot || library) return;
    loadLibrary(lastText)
      .then((rows) => (library = rows))
      .catch(() => (failed = true));
  });

  const groups = $derived(slot ? swapGroups(slot) : []);
  const listed = $derived(
    new Set([String(slot ? exerciseFor(slot).id : ''), ...groups.flatMap((g) => g.options.map((o) => String(o.id)))]),
  );
  const regions = $derived(library ? libraryRegions(library, listed, query) : []);
  const searching = $derived(query.trim() !== '');
</script>

{#if slot}
  {@const ex = exerciseFor(slot)}
  <Sheet label={`Swap ${ex.name}`} onclose={closeSwap}>
    <div class="stack-tight">
      <span class="hr-eyebrow">{ex.region}</span>
      <h2 class="hr-sheet__title">Swap {ex.name}</h2>
      <span class="hr-jjk">Weapon Swap</span>
    </div>
    {#each groups as group (group.label)}
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

    <section class="stack" aria-labelledby="swap-all-label">
      <span id="swap-all-label" class="hr-eyebrow">All exercises</span>
      <label class="hr-search">
        <Icon name="search" />
        <input type="search" placeholder="Search all exercises" aria-label="Search all exercises" bind:value={query}>
      </label>
      {#if failed}
        <span class="meta">The full list needs a connection once; after that it works offline.</span>
      {:else if !library}
        <span class="meta">Loading the exercise list…</span>
      {:else if !regions.length}
        <span class="meta">{searching ? 'No exercise matches.' : 'Every exercise is listed above.'}</span>
      {/if}
      {#each regions as rg (rg.name)}
        {@const isOpen = searching || !!open[rg.name]}
        <div class="stack">
          <button class="region-head" aria-expanded={isOpen} onclick={() => (open[rg.name] = !open[rg.name])}>
            <span class="region-head__name">{rg.name}</span>
            <span class="meta-strong">{rg.rows.length}</span>
            <span class="region-head__chev" class:region-head__chev--open={isOpen}><Icon name="chevron-down" /></span>
          </button>
          {#if isOpen}
            <div class="region-body">
              {#each rg.rows as row (row.id)}
                <button class="hr-sheet__option" onclick={() => pickFromLibrary(row)}>
                  <span class="option-text">
                    <span class="option-name">{row.name}</span>
                    <span class="meta">{row.muscle ?? ''}{row.muscle ? ' · ' : ''}{row.lastText}</span>
                  </span>
                  <span class="muted"><Icon name="chevron-right" /></span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </section>

    <button class="hr-btn hr-btn--secondary" onclick={closeSwap}>Cancel</button>
  </Sheet>
{/if}
