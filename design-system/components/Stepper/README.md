# Stepper

A number field with − and + buttons for weight, reps, seconds or minutes, showing last session's value faded until the user changes it.

**Classes:** `hr-stepper` wrapping `hr-stepper__label`, `hr-stepper__box` (with two `hr-stepper__step` buttons and an `<input>`) and `hr-stepper__hint`.

**The consumer provides:** the prior value as the input's `placeholder` (it renders in `text-faded`), the step size (2.5 lb for weight, 1 for reps, 5 s for holds), the unit in the eyebrow label, and a hint line (last time, or the target).

- Faded = not yet confirmed. Tapping Log set with the field empty accepts the faded value; typing or stepping replaces it and the text turns `text`.
- Use `inputmode="decimal"` for weight and `numeric` for reps so the S23 opens the number pad.
- Each step button is 44 wide × 56 tall, so two steppers fit side by side at 360 px with the value still about 70 px wide. The value uses the `value` text style with tabular figures so digits don't shift.
- The `aria-label` on the input must include the prior value ("last time 140"), since a placeholder is not announced reliably.
