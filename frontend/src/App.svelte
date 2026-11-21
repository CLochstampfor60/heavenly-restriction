<script>
  import SwapSheet from './components/SwapSheet.svelte';
  import { route } from './router.svelte.js';
  import ExerciseCard from './screens/ExerciseCard.svelte';
  import Library from './screens/Library.svelte';
  import Login from './screens/Login.svelte';
  import Progress from './screens/Progress.svelte';
  import SetLog from './screens/SetLog.svelte';
  import Settings from './screens/Settings.svelte';
  import Today from './screens/Today.svelte';
  import { ensureExercise } from './stores/source.svelte.js';
  import { day } from './stores/workout.svelte.js';
  import { applyUpdate, updates } from './stores/updates.svelte.js';

  const logId = $derived(route.path.match(/^\/log\/([^/]+)$/)?.[1]);
  const exerciseId = $derived(route.path.match(/^\/exercise\/(\w+)$/)?.[1]);
</script>

<div class="app">
  {#if updates.available}
    <div class="update-bar" role="status">
      <span class="small">Update available</span>
      <button class="hr-btn hr-btn--secondary hr-btn--compact" onclick={applyUpdate}>Reload</button>
    </div>
  {/if}
  {#if route.path === '/login'}
    <Login />
  {:else if logId && day.slots[logId]?.plan.loggable}
    {#key logId}<SetLog slotId={logId} />{/key}
  {:else if exerciseId}
    {#key exerciseId}
      {#await ensureExercise(exerciseId)}
        <div class="app__scroll"><p class="small muted empty-note">Loading…</p></div>
      {:then ex}
        {#if ex}<ExerciseCard id={exerciseId} />{:else}<Today />{/if}
      {:catch}
        <div class="app__scroll">
          <p class="small muted empty-note">Can't load this exercise without a connection.</p>
          <a class="hr-btn hr-btn--secondary" href="#/library">Back to the library</a>
        </div>
      {/await}
    {/key}
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
