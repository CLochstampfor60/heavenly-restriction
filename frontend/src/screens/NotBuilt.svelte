<script>
  import Nav from '../components/Nav.svelte';

  let { current, title, jjk = null } = $props();
</script>

<div class="app__scroll">
  <header class="stack-tight">
    <h1 class="title screen-title">{title}</h1>
    {#if jjk}<span class="hr-jjk">{jjk}</span>{/if}
  </header>
  <p class="body muted">Not built yet. Today's workout and set logging come first.</p>
</div>
<Nav {current} />
