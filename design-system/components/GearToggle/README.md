# GearToggle

A full-width on/off row for the equipment brought today (Bands, Hip Halo, Straps).

**Classes:** `hr-toggle` with `role="switch"` and `aria-checked`, containing a label and `hr-toggle__switch`.

**The consumer provides:** the item name and its state. The whole 56px row is the tap target, not just the switch.

- On: `accent` track. Off: `surface-3` track with a `border-strong` edge, so it is visible without color.
- Exercises that need missing gear show their alternative or are marked Skipped, never counted as missed.
