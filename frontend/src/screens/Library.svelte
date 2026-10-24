<script>
  import Icon from '../components/Icon.svelte';
  import Nav from '../components/Nav.svelte';
  import { CATALOG, PROGRAM } from '../fixtures/demo.js';
  import { lastText } from '../stores/workout.svelte.js';

  const REGIONS = ['Back', 'Core', 'Chest', 'Shoulders', 'Arms', 'Legs', 'Hips'];
  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'program', label: 'In my program' },
    { id: 'video', label: 'Has video' },
    { id: 'excluded', label: 'Excluded' },
  ];

  const inProgram = new Set(PROGRAM.slots.map((s) => s.exercise));
  // Substitutes: listed under a program exercise's swaps but not in the program themselves.
  const substitutes = new Set(
    [...inProgram].flatMap((id) => [...(CATALOG[id].subs ?? []), ...(CATALOG[id].same ?? [])]).filter((id) => !inProgram.has(id)),
  );
  const all = Object.values(CATALOG).map((ex) => {
    const [region, muscle] = ex.region.split(' › ');
    return {
      ...ex,
      regionName: region,
      muscle,
      programDay: inProgram.has(ex.id) ? PROGRAM.name : ex.day,
      hasVideo: !!ex.media?.length,
      sub: substitutes.has(ex.id),
    };
  });

  let query = $state('');
  let filter = $state('all');
  let open = $state({ Back: true, Core: true });

  const q = $derived(query.trim().toLowerCase());
  const filtering = $derived(filter !== 'all' || q !== '');

  function keep(ex) {
    if (q && !ex.name.toLowerCase().includes(q)) return false;
    if (filter === 'program') return !!ex.programDay && !ex.excluded;
    if (filter === 'video') return ex.hasVideo;
    if (filter === 'excluded') return !!ex.excluded;
    return !ex.excluded;
  }

  const regions = $derived(
    REGIONS.map((name) => {
      const inRegion = all.filter((ex) => ex.regionName === name);
      const shown = inRegion.filter(keep);
      const muscles = [...new Set(shown.map((ex) => ex.muscle))].map((muscle) => ({
        muscle,
        items: shown.filter((ex) => ex.muscle === muscle),
      }));
      return {
        name,
        total: inRegion.filter((ex) => !ex.excluded).length,
        shown: shown.length,
        muscles,
        isOpen: filtering ? shown.length > 0 : !!open[name],
      };
    }).filter((rg) => (filtering ? rg.shown > 0 : rg.total > 0)),
  );
  const exerciseCount = all.filter((ex) => !ex.excluded).length;

  function rowLabel(ex) {
    return [ex.name, ex.programDay && `in ${ex.programDay}`, ex.grade, ex.hasVideo && 'has video', ex.excluded && 'excluded']
      .filter(Boolean)
      .join(', ');
  }
</script>

<div class="app__scroll">
  <header class="stack-tight">
    <h1 class="title screen-title">Exercise library</h1>
    <span class="hr-jjk">Inventory · {exerciseCount} exercises</span>
  </header>

  <label class="hr-search">
    <Icon name="search" />
    <input type="search" placeholder="Search exercises" aria-label="Search exercises" bind:value={query}>
  </label>

  <div class="filter-row" role="group" aria-label="Filter">
    {#each FILTERS as f (f.id)}
      <button class="hr-filter" aria-pressed={filter === f.id} onclick={() => (filter = f.id)}>{f.label}</button>
    {/each}
  </div>

  <div class="stack">
    {#each regions as rg (rg.name)}
      <div class="stack">
        <button
          class="region-head"
          aria-expanded={rg.isOpen}
          onclick={() => (open[rg.name] = !open[rg.name])}
        >
          <span class="region-head__name">{rg.name}</span>
          <span class="meta-strong">
            {filtering ? `${rg.shown} match${rg.shown === 1 ? '' : 'es'}` : `${rg.total} exercises`}
          </span>
          <span class="region-head__chev" class:region-head__chev--open={rg.isOpen}><Icon name="chevron-down" /></span>
        </button>
        {#if rg.isOpen}
          <div class="region-body">
            {#each rg.muscles as group (group.muscle)}
              <div class="stack muscle-group">
                <span class="exh-meta-row"><span class="hr-tag">{group.muscle}</span><span class="meta-strong">{group.items.length}</span></span>
                {#each group.items as ex (ex.id)}
                  <a class="lib-row" class:lib-row--excluded={ex.excluded} href="#/exercise/{ex.id}" aria-label={rowLabel(ex)}>
                    <span class="option-text">
                      <span class="option-name">{ex.name}</span>
                      <span class="meta">{ex.equip} · {lastText(ex)}{ex.sub ? ' · substitute' : ''}</span>
                    </span>
                    <span class="lib-row__marks">
                      <span class="lib-row__top">
                        {#if ex.hasVideo}<span class="muted lib-video"><Icon name="play" /></span>{/if}
                        {#if ex.grade}<span class="hr-grade hr-grade--sm">{ex.grade}</span>{/if}
                      </span>
                      {#if ex.excluded}<span class="excluded-badge">Excluded</span>
                      {:else if ex.programDay}<span class="hr-daytag">{ex.programDay}</span>{/if}
                    </span>
                  </a>
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <p class="small muted empty-note">No exercises match. Try another name or clear the filter.</p>
    {/each}
  </div>
</div>
<Nav current="library" />
