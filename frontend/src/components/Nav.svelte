<script>
  import Icon from './Icon.svelte';

  let { current } = $props();
  const links = [
    { id: 'today', href: '#/', icon: 'calendar', label: 'Today' },
    { id: 'library', href: '#/library', icon: 'library', label: 'Library' },
    { id: 'progress', href: '#/progress', icon: 'progress', label: 'Progress' },
  ];
</script>

<nav class="hr-nav" aria-label="Main">
  {#each links as link (link.id)}
    <a href={link.href} class="hr-navlink" aria-current={link.id === current ? 'page' : undefined}>
      <Icon name={link.icon} />{link.label}
    </a>
  {/each}
</nav>
