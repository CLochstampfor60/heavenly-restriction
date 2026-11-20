<script>
  // "Saved" / "N waiting to save": what has reached the server. Hidden in demo mode.
  import Icon from './Icon.svelte';
  import { saveStatus } from '../logic.js';
  import { source } from '../stores/source.svelte.js';
  import { sync } from '../stores/sync.svelte.js';

  const status = $derived(saveStatus({ total: sync.pending, offline: sync.offline }));
</script>

{#if !source.demo}
  <span class="meta save-status" class:save-status--waiting={status.state !== 'saved'} role="status">
    <Icon name={status.state === 'saved' ? 'check' : 'timer'} />{status.text}
  </span>
{/if}
