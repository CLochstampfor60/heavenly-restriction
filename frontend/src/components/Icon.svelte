<script module>
  // Inlines design-system/assets/Icons/<name>.svg so the stroke follows currentColor.
  const files = import.meta.glob('@ds/assets/Icons/*.svg', { query: '?raw', import: 'default', eager: true });
  const icons = {};
  for (const [path, svg] of Object.entries(files)) {
    icons[path.split('/').pop().replace('.svg', '')] = svg
      .replace(' width="24" height="24"', '')
      .replace('stroke="#e9edea"', 'stroke="currentColor"')
      .replace('<svg ', '<svg class="hr-icon" aria-hidden="true" focusable="false" ');
  }
</script>

<script>
  // Always decorative: give the surrounding button or span its own label.
  let { name } = $props();
</script>

{@html icons[name]}
