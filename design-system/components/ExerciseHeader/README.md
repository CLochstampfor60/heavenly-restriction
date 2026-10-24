# ExerciseHeader

The top of the set-logging screen: where the exercise sits in today's workout, its name, targets, and the Later, Swap and Stop actions.

**Classes:** `hr-exh`, `hr-exh__top`, `hr-exh__name`, `hr-exh__meta`, `hr-exh__actions`.

**The consumer provides:** position in the day ("Exercise 2 of 6"), the body region and muscle, exercise name, the program slot's sets, rep range or duration and rest, and handlers for Later, Swap, form video and Stop.

- Name in the `title` style. The position and anatomy line sits above it as an `hr-eyebrow`.
- Stop sits top-right, as far from the bottom action bar as the screen allows.
- Later moves the exercise to the bottom of the list; Swap opens the same-muscle list, Substitutions first.
