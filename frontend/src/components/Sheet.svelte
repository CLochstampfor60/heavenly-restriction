<script>
  let { label, stop = false, onclose, children } = $props();
  let sheet;

  $effect(() => {
    sheet.focus();
  });

  function onkeydown(event) {
    if (event.key === 'Escape') onclose();
  }
</script>

<svelte:window {onkeydown} />

<div class="hr-sheet-wrap sheet-layer">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="hr-scrim" aria-hidden="true" onclick={onclose}></div>
  <div
    bind:this={sheet}
    class="hr-sheet"
    class:hr-sheet--stop={stop}
    role="dialog"
    aria-modal="true"
    aria-label={label}
    tabindex="-1"
  >
    {@render children()}
  </div>
</div>
