# SetRow

One row per planned set: set number, weight, reps (or seconds) and a 56px check box that logs the set in one tap.

**Classes:** `hr-set` plus a state: `hr-set--active`, `hr-set--done`, `hr-set--pr`, `hr-set--skipped`, `hr-set--stopped`. Values use `hr-set__v`; add `hr-set__v--faded` while showing last session's numbers.

**The consumer provides:** set number, prior values for that exercise and set number, logged values once done, PR status, and the check handler.

- **Upcoming:** faded prior values. Tapping the check logs them as-is (the Strong-style one-tap path) and starts the rest timer.
- **Active:** `surface-3` with a `cursed` edge and set number; the Stepper editor above the action bar edits this row.
- **Done:** `accent-soft` row, solid `accent` check. Tap again to undo.
- **PR:** `flash-soft` row, `flash` box with the bolt icon. The bolt and the set number in `flash` carry the meaning, not just the color.
- **Skipped / Stopped:** text, never color alone. Stopped uses the octagon icon and `stop`.
- Rows are 56px tall with `space-3` (12px) between them.
