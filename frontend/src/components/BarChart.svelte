<script>
  import { niceScale } from './LineChart.svelte';

  // Teal bars for cardio. points: [{ x, value, planned? }]; a planned bar is dashed at its planned height.
  let { points, selected, onselect, goal = null, aria } = $props();

  const X0 = 44;
  const X1 = 296;
  const TOP = 26;
  const BASE = 170;

  const height = (p) => p.planned || p.value;
  const scale = $derived(
    niceScale(0, Math.max(...points.map(height), goal ? goal.value : 0), { zero: true }),
  );
  const ticks = $derived.by(() => {
    const out = [];
    for (let v = scale.lo; v <= scale.hi + 1e-9; v += scale.step) out.push(v);
    return out;
  });
  const slot = $derived((X1 - X0 + 24) / points.length);
  const barW = $derived(Math.min(28, slot * 0.6));
  const cx = (i) => X0 - 12 + slot * (i + 0.5);
  const sy = (v) => BASE - ((BASE - TOP) * (v - scale.lo)) / (scale.hi - scale.lo);
  const showX = (i) => points.length <= 7 || i % 2 === 1 || i === points.length - 1;
</script>

<svg class="hr-chart" viewBox="0 0 316 200" role="img" aria-label={aria}>
  {#each ticks as v (v)}
    <line class="hr-grid" x1="36" x2="304" y1={sy(v)} y2={sy(v)}></line>
    <text class="hr-axis" x="30" y={sy(v) + 4} text-anchor="end">{v}</text>
  {/each}
  {#each points as p, i (i)}
    {@const h = height(p)}
    <rect
      class="hr-bar chart-bar"
      class:hr-bar--planned={p.planned}
      class:chart-bar--sel={i === selected && !p.planned}
      x={cx(i) - barW / 2}
      y={sy(h)}
      width={barW}
      height={Math.max(0, BASE - sy(h))}
      rx="4"
    ></rect>
    {#if h}
      <text class="hr-label" x={cx(i)} y={sy(h) - 6} text-anchor="middle">{p.planned ? `plan ${p.planned}` : p.value}</text>
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <rect class="chart-hit" x={cx(i) - slot / 2} y={TOP} width={slot} height={BASE - TOP} onclick={() => onselect(i)}></rect>
    {#if showX(i)}<text class="hr-axis" x={cx(i)} y="194" text-anchor="middle">{p.x}</text>{/if}
  {/each}
  {#if goal}
    <line class="hr-goal" x1="36" x2="304" y1={sy(goal.value)} y2={sy(goal.value)}></line>
    <text class="hr-goal-label" x="304" y={sy(goal.value) - 6} text-anchor="end">{goal.label}</text>
  {/if}
</svg>
