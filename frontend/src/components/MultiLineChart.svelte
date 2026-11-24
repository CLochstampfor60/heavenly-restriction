<script>
  // Up to five lines on one % scale (Progress › Lift › % gain): one measure, one y-axis, so the
  // design-system exception to "one series per chart" (see design-system README › Charts).
  // Lines in distinct token colors (ml-c0..ml-c4), points only at each line's ends, and a direct
  // label at the right end of each line (name and value in text color, a short tick in the
  // line's color): no legend box. series: [{ id, name, assisted, points: [{ date, value }] }]
  import { axisDomain } from '../logic.js';
  import { fmt1 } from './LineChart.svelte';

  let { series, aria, xLabel = (d) => d } = $props();

  const X0 = 40;
  const X1 = 212;
  const TOP = 18;
  const BASE = 170;
  const LABEL_X = 226;
  const LABEL_H = 26;

  const dates = $derived([...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort());
  const scale = $derived(axisDomain(series.flatMap((s) => s.points.map((p) => p.value)).concat([0]), { floor0: false }));
  const sx = (date) => {
    const i = dates.indexOf(date);
    return dates.length === 1 ? (X0 + X1) / 2 : X0 + ((X1 - X0) * i) / (dates.length - 1);
  };
  const sy = (v) => BASE - ((BASE - TOP) * (v - scale.lo)) / (scale.hi - scale.lo);
  const pct = (v) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : ''}${fmt1(Math.abs(v))}%`;
  const short = (name) => (name.length > 13 ? `${name.slice(0, 12)}…` : name);

  const lines = $derived(
    series.map((s, k) => ({
      ...s,
      k,
      d: s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.date).toFixed(1)} ${sy(p.value).toFixed(1)}`).join(' '),
      first: s.points[0],
      last: s.points.at(-1),
    })),
  );

  // End labels: in the order of the lines' end values, pushed apart so none overlap.
  const labels = $derived.by(() => {
    const out = lines.filter((l) => l.last).map((l) => ({ ...l, y: sy(l.last.value) })).sort((a, b) => a.y - b.y);
    for (let i = 0; i < out.length; i++) out[i].y = Math.max(out[i].y, i ? out[i - 1].y + LABEL_H : TOP);
    const overflow = out.length ? out.at(-1).y - (BASE + 12) : 0;
    if (overflow > 0) for (const l of out) l.y -= overflow;
    return out;
  });
  const xTicks = $derived(dates.length <= 2 ? dates : [dates[0], dates.at(-1)]);
</script>

<svg class="hr-chart" viewBox="0 0 316 200" role="img" aria-label={aria}>
  {#each scale.ticks as v (v)}
    <line class="hr-grid" class:ml-zero={Math.abs(v) < 1e-9} x1="34" x2={X1 + 4} y1={sy(v)} y2={sy(v)}></line>
    <text class="hr-axis" x="30" y={sy(v) + 4} text-anchor="end">{fmt1(v)}%</text>
  {/each}
  {#each xTicks as d (d)}
    <text class="hr-axis" x={sx(d)} y="194" text-anchor="middle">{xLabel(d)}</text>
  {/each}
  {#each lines as l (l.id)}
    <path class="ml-line ml-c{l.k}" d={l.d}></path>
    {#if l.first}<circle class="ml-dot ml-c{l.k}" cx={sx(l.first.date)} cy={sy(l.first.value)} r="4"></circle>{/if}
    {#if l.last && l.last !== l.first}<circle class="ml-dot ml-c{l.k}" cx={sx(l.last.date)} cy={sy(l.last.value)} r="4"></circle>{/if}
  {/each}
  {#each labels as l (l.id)}
    <line class="ml-tick ml-c{l.k}" x1={LABEL_X - 10} x2={LABEL_X - 2} y1={l.y - 4} y2={l.y - 4}></line>
    <text class="ml-name" x={LABEL_X} y={l.y}>{short(l.name)}</text>
    <text class="ml-value hr-num" x={LABEL_X} y={l.y + 12}>{pct(l.last.value)}{l.assisted ? ' · assist' : ''}</text>
  {/each}
</svg>
