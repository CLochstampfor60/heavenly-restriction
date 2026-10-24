# BottomSheet

A panel that slides up over a dimmed screen for a short choice: the Swap list, the stop sheet.

**Classes:** `hr-sheet-wrap` (positioned over the screen) holding `hr-scrim` and `hr-sheet`; `hr-sheet--stop` adds the amber top edge for the stop sheet. Title `hr-sheet__title`; choices `hr-sheet__option`.

**The consumer provides:** the title (plain first, JJK name as `hr-jjk` under it), the options, and Cancel.

- Enters with `duration-slow` and `ease-out`. Tapping the scrim or Cancel closes it.
- Options are 56 px rows on `card-2` with a `border-strong` edge.
- `role="dialog"`, `aria-modal="true"` and an `aria-label` matching the title.
