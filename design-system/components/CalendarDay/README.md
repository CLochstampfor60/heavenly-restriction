# CalendarDay

One day in the progress calendar, colored and marked by what happened.

**Classes:** `hr-cal` (7-column grid) of `hr-day` cells, with `hr-day--done`, `--partial`, `--skip`, `--stop`, `--cardio`, `--rest`, `--today`; day number `hr-day__n`; a personal record adds `hr-day__pr`.

- Every state has an icon as well as a color: check, half circle, dash, octagon, heart-pulse, moon. Keep the legend under the grid.
- Cells are at least 44 px tall; the grid gap is 3 px so seven columns fit at 360 px.
- Each cell's `aria-label` says the date and state ("October 5, stop event").
