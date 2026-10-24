# RestTimer

A pill that counts down rest after a set is checked off, with +15 s and Skip.

**Classes:** `hr-timer`, `hr-timer__ring` (an SVG with `hr-track` and `hr-prog` circles), `hr-timer__time`, `hr-timer__label`; `hr-timer--done` at zero. `hr-timer-big` is the 64px countdown for a full-screen view.

**The consumer provides:** remaining seconds, the target rest from the program slot, and handlers for +15 s and Skip.

- Starts automatically when a set is logged; never needs a tap to begin.
- Sits directly above the action bar so it is visible while the next set's fields are edited.
- The ring advances once per second with `duration-slow`; under reduce-motion it jumps.
- The ring counts down in `cursed` (rest is the Reverse Cursed Technique moment). At zero it turns `accent` with the words "Rest done". A vibration is fine; never a sound by default.
