# Chart

The styling for progress charts: one series as a filled line (bodyweight, waist, a lift) or teal bars (cardio), on a recessive grid with a dashed gold goal line. The README's Charts section has the full rules.

**Classes on an inline `<svg class="hr-chart">`:** `hr-grid`, `hr-axis`, `hr-area`, `hr-line`, `hr-dot` (`--pr`, `--sel`), `hr-label`, `hr-goal`, `hr-goal-label`, `hr-bar`, `hr-bar--planned`.

**The consumer provides:** the points, the goal value and label, and a tap handler per point or bar that updates the readout above the chart.

- One series per chart and one y-axis. A single series needs no legend; the title names it.
- Label every point when there are 6 or fewer; otherwise only first, last, highest and lowest.
- Personal-record points use `hr-dot--pr`; a stop event is an amber octagon on the axis, and the line skips that session.
- Each point gets a transparent 18 px-radius hit circle so it can be tapped.
