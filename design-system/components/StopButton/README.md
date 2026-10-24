# StopButton

The stop button: one tap ends the current exercise and opens the stop sheet to record the symptom, load and set.

**Classes:** `hr-stop` (amber outline) and `hr-stop--solid` (filled, only for the confirm button inside the stop sheet).

**The consumer provides:** a `<button>`, the octagon `stop` icon, and the label **Stop**. Icon-only needs `aria-label="Stop exercise"`.

- The icon is a plain octagon outline, the stop-sign shape.
- Uses `stop` only. Amber, never red, so it is never mistaken for a Black Flash personal record (`flash`).
- Always icon plus the word, never color alone.
- Place it in the exercise header's top-right, away from the Log set button, so it is never hit by accident. At least `tap-row` (56px) square.
- Never ask "Are you sure?" to open the sheet. The sheet itself is the confirmation and has a Cancel.
