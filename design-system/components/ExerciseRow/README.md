# ExerciseRow

One exercise in Today's workout, in program order, showing how it stands: done, in progress, upcoming, swapped or stopped.

**Classes:** `hr-exrow` plus `hr-exrow--done`, `hr-exrow--current` or `hr-exrow--swap`; parts `hr-exrow__mark`, `hr-exrow__body`, `hr-exrow__name`, `hr-exrow__meta`, `hr-exrow__note`, `hr-exrow__actions`. The region tag inside is `hr-tag`.

**The consumer provides:** position in the day, exercise name (the swapped or gear alternative when one applies), region and muscle, the plan and last top set, logged sets out of planned ("2 of 4 sets"), and handlers for Later, Swap and Undo stop.

- Sits on `card`; an exercise in progress (some sets logged) is `card-2` with a `cursed` edge and the `partial` mark. Several can be in progress at once: workouts are never linear.
- Done shows a solid `accent` check and a Done chip; the name dims to `text-2`.
- Upcoming rows carry Later and Swap as 44 px icon buttons with `aria-label`s naming the exercise.
- Swapped or gear-alternative rows switch the mark to the swap icon in `info` and add a one-line note saying why.
- The row body (`hr-exrow__body`, a link) opens the exercise pager at that exercise, whatever its state.
- Stopped rows show the octagon mark, a "Stopped · <symptom>" line and a compact secondary **Undo stop** button.
