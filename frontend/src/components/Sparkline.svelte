<script>
  // A small trend line: no axes, no points, one accessible label. values: numbers, oldest first.
  let { values, label } = $props();

  const W = 64;
  const H = 24;
  const path = $derived.by(() => {
    if (values.length < 2) return '';
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const y = (v) => (hi === lo ? H / 2 : H - 3 - ((H - 6) * (v - lo)) / (hi - lo));
    return values.map((v, i) => `${i ? 'L' : 'M'}${((W * i) / (values.length - 1)).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  });
</script>

<svg class="sparkline" viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label={label}>
  {#if path}
    <path d={path}></path>
  {:else}
    <line x1="0" x2={W} y1={H / 2} y2={H / 2}></line>
  {/if}
</svg>
