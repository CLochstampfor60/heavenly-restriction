<script>
  import SwapSheet from './components/SwapSheet.svelte';
  import { CATALOG } from './fixtures/demo.js';
  import { route } from './router.svelte.js';
  import ExerciseCard from './screens/ExerciseCard.svelte';
  import Library from './screens/Library.svelte';
  import Progress from './screens/Progress.svelte';
  import SetLog from './screens/SetLog.svelte';
  import Settings from './screens/Settings.svelte';
  import Today from './screens/Today.svelte';
  import { day } from './stores/workout.svelte.js';

  const logId = $derived(route.path.match(/^\/log\/(\w+)$/)?.[1]);
  const exerciseId = $derived(route.path.match(/^\/exercise\/(\w+)$/)?.[1]);
</script>

<div class="app">
  {#if logId && day.slots[logId]}
    {#key logId}<SetLog slotId={logId} />{/key}
  {:else if exerciseId && CATALOG[exerciseId]}
    {#key exerciseId}<ExerciseCard id={exerciseId} />{/key}
  {:else if route.path === '/library'}
    <Library />
  {:else if route.path === '/settings'}
    <Settings />
  {:else if route.path === '/progress'}
    <Progress />
  {:else}
    <Today />
  {/if}
  <SwapSheet />
</div>
