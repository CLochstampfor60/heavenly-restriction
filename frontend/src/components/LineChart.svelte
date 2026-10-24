<script module>
  // Round axis bounds and a step that gives three or four grid lines.
  export function niceScale(lo, hi, { zero = false } = {}) {
    const pad = (hi - lo) * 0.12 || 1;
    const min = zero ? 0 : lo - pad;
    const max = hi + pad;
    const raw = (max - min) / 3;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
  }

  export const fmt1 = (n) => String(Math.round(n * 10) / 10);
</script>

<script>
  // One series as a line (optionally filled). Stopped sessions sit on the axis as an amber
  // octagon and the line skips them. points: [{ x, value, pr?, stopped? }]
  let { points, selected, onselect, goal = null, area = false, aria, format = fmt1 } = $props();

  const X0 = 44;
  const X1 = 296;
  const TOP = 26;
  const BASE = 170;

  const live = $derived(points.map((p, i) => ({ ...p, i })).filter((p) => !p.stopped));
  const scale = $derived.by(() => {
    const vals = live.map((p) => p.value).concat(goal ? [goal.value] : []);
    return niceScale(Math.min(...vals), Math.max(...vals));
  });
  const ticks = $derived.by(() => {
    const out = [];
    for (let v = scale.lo; v <= scale.hi + 1e-9; v += scale.step) out.push(v);
    return out;
  });

  const sx = (i) => (points.length === 1 ? (X0 + X1) / 2 : X0 + ((X1 - X0) * i) / (points.length - 1));
  const sy = (v) => BASE - ((BASE - TOP) * (v - scale.lo)) / (scale.hi - scale.lo);

  const line = $derived(live.map((p, k) => `${k ? 'L' : 'M'}${sx(p.i).toFixed(1)} ${sy(p.value).toFixed(1)}`).join(' '));
  const fill = $derived(
    live.length
      ? `${line} L${sx(live.at(-1).i).toFixed(1)} ${BASE} L${sx(live[0].i).toFixed(1)} ${BASE} Z`
      : '',
  );

  // Every point when there are 6 or fewer; otherwise first, last, highest and lowest.
  const labeled = $derived.by(() => {
    if (live.length <= 6) return new Set(live.map((p) => p.i));
    const by = [...live].sort((a, b) => a.value - b.value);
    return new Set([live[0].i, live.at(-1).i, by[0].i, by.at(-1).i]);
  });
  const showX = (i) => points.length <= 6 || i % 2 === 0 || i === points.length - 1;

  function octagon(cx, cy, k = 6, q = 2.5) {
    return [[-q, -k], [q, -k], [k, -q], [k, q], [q, k], [-q, k], [-k, q], [-k, -q]]
      .map(([x, y]) => `${(cx + x).toFixed(1)},${(cy + y).toFixed(1)}`)
      .join(' ');
  }
</script>

<svg class="hr-chart" viewBox="0 0 316 200" role="img" aria-label={aria}>
  {#each ticks as v (v)}
    <line class="hr-grid" x1="36" x2="304" y1={sy(v)} y2={sy(v)}></line>
    <text class="hr-axis" x="30" y={sy(v) + 4} text-anchor="end">{format(v)}</text>
  {/each}
  {#if area && fill}<path class="hr-area" d={fill}></path>{/if}
  <path class="hr-line" d={line}></path>
  {#if goal}
    <line class="hr-goal" x1="36" x2="304" y1={sy(goal.value)} y2={sy(goal.value)}></line>
    <text class="hr-goal-label" x="304" y={sy(goal.value) - 6} text-anchor="end">{goal.label}</text>
  {/if}
  {#each points as p, i (i)}
    {#if showX(i)}<text class="hr-axis" x={sx(i)} y="194" text-anchor="middle">{p.x}</text>{/if}
    {#if p.stopped}
      <polygon class="chart-stop" points={octagon(sx(i), BASE)}></polygon>
    {:else}
      {#if labeled.has(i)}
        <text class="hr-label" x={sx(i)} y={sy(p.value) - 12} text-anchor="middle">{format(p.value)}</text>
      {/if}
      <circle
        class="hr-dot"
        class:hr-dot--pr={p.pr && i !== selected}
        class:hr-dot--sel={i === selected}
        cx={sx(i)}
        cy={sy(p.value)}
        r={i === selected ? 7 : 5}
      ></circle>
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <circle class="chart-hit" cx={sx(i)} cy={p.stopped ? BASE : sy(p.value)} r="18" onclick={() => onselect(i)}></circle>
  {/each}
</svg>
