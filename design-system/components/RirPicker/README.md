# RirPicker

An optional one-tap reps-in-reserve selector: 0, 1, 2, 3, 4+.

**Classes:** `hr-rir`, `hr-rir__cells`, `hr-rir__cell` with `aria-pressed`.

**The consumer provides:** the selected value (or none) and a tap handler. Tapping the selected cell again clears it.

- Optional means optional: never block Log set on it, and don't preselect last time's value.
- Cells are 44px tall with 8px gaps. Selected fills with `cursed` and `on-cursed`, so the bottom panel doesn't read as all green next to Log set.
- Label it "Reps in reserve"; spell the term out once per screen, then "RIR" is fine in compact rows.
