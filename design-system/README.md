Heavenly Restriction is a single-user workout tracker used mid-set, on a Galaxy S23 at 360 px wide, in gym lighting, often with one sweaty thumb. Every rule below serves that: big targets, high contrast, numbers first, nothing decorative that slows a set down. The Jujutsu Kaisen theme is flavor; the plain label always comes first.

## Content fundamentals

- **Plain label first, JJK name second.** Write the plain name as the label and the JJK name as a secondary line in `small` / `text-2` (class `hr-jjk`). Only headers, sheets and banners carry the JJK name; buttons, fields and chips use the plain label alone.

  | Plain label (primary) | JJK name (secondary) |
  | --- | --- |
  | Today's workout | Today's Mission |
  | Exercise library | Inventory |
  | Swap | Weapon Swap |
  | Progression levels | Grade 4 → Grade 1 → Special Grade |
  | Personal record | Black Flash |
  | Pinned load caps and guardrails | Binding Vow |
  | Recovery day | Reverse Cursed Technique |

- **Sentence case** everywhere: "Log set", "Rest done". Uppercase only in `eyebrow` labels (SET, LB, REPS).
- **The app talks to its one user, briefly.** "Last time 140", not "Your previous session's weight was 140 lb."
- **Numbers before words.** "145 lb × 9", "1:30", "est. 1RM 187". Units in American notation: lb, s, min.
- **No emoji, no exclamation marks.** A personal record is announced by the Black Flash banner, not by "Amazing!!".
- **No character art or official imagery.** The theme lives in names and color only; the app icon is an original chain-and-blade motif (see App icon).

## Color

Dark is the default theme; Light has the same tokens with its own values (see Themes). Color is spent sparingly so the signals stay loud.

- **Ground:** `bg` behind everything, `surface-1` for cards and bars, `surface-2` for input wells and set rows, `surface-3` for pressed and active. Separate layers by surface step and `border`, not shadows.
- **Cards (`card`, `card-2`, `card-edge`):** a third, cool slate ground taken from Toji's palette. Content the user reads and taps (exercise rows, upcoming set rows, notes, toggles, sheet options) sits on `card`; the active row and input wells on `card-2`. The frame (page, bars, sheets) stays green-black, so cards read blue-grey against it whatever the accent. Don't put anything lighter than `card-2` under text: a lighter slate fails for `text-faded` and `flash`.
- **Text:** `text` for values and primary copy, `text-2` for secondary copy and JJK names, `text-faded` only for last session's prior values sitting in empty fields. All three pass 4.5:1 on `bg`, every surface and every `-soft` tint.
- **Accent (`accent`):** the muted cursed-energy green. Primary buttons, the Done check, the timer ring, selected RIR, active toggles. Text on an accent fill is `on-accent`.
- **Cursed (`cursed`):** the second accent, a cursed-energy violet, so screens aren't all green. Green means done or go; violet means what is happening now, and JJK flavor. Use it for the active set row and the current exercise's outline, the rest timer ring, the selected RIR, region tags (`hr-tag`, on `cursed-soft`), the pinned-note icon, and every JJK secondary name (`hr-jjk`). Never on a primary button or a Done mark. Green and violet are close in lightness, so the meaning always also comes from position or an icon (a check for done, an outline for current).
- **Black Flash (`flash`):** personal records and nothing else. Row tint `flash-soft`, solid badge `flash` with `on-flash`. Always paired with the bolt icon and "PR".
- **Stop (`stop`):** the stop button and stop events only. Amber, deliberately not red, so it can never be confused with a Black Flash. Always paired with the octagon icon and "Stop".
- **Recover (`recover`, `recover-soft`):** teal for recovery and cardio only: Sunday recovery (Reverse Cursed Technique), Saturday cardio, cardio minutes against the ~345 min weekly target. It sits close to the green accent, so it appears on recovery and cardio days and charts, never next to green Done marks, and always with the heart-pulse icon and a word.
- **Grade (`grade`, `grade-soft`):** pale Jujutsu gold for progression and goals only: grade badges (Grade 4 → Grade 1 → Special Grade), the dashed goal line on progress charts, and weekly targets. It is warm like `stop`, so it appears only on progress and library screens, never on a screen with a Stop button.
- **Info (`info`):** Swapped status. Always with the swap icon.
- **Never color alone.** `accent` and `flash` are close in lightness; they are told apart by icon and word, which every component already carries.
- **Control edges** use `border-strong` (3:1 or better on every surface). `border` is decorative only.

### Changing the accent from Settings

The Settings accent picker overrides exactly four tokens on `:root`: `accent`, `accent-strong`, `accent-soft`, `on-accent` (plus the preset's own swaps noted below the table). Nothing else in the app may hard-code the accent; reference `var(--accent)` and its siblings. The presets are stored as `preset-…` tokens so the picker reads them instead of hard-coding hex values. Label each with the plain name first and the JJK name second.

| Preset | JJK name | `accent` | `accent-strong` | `accent-soft` | `on-accent` |
| --- | --- | --- | --- | --- | --- |
| Green (default) | Cursed Energy | `accent` #7fa889 | `accent-strong` #9cc3a5 | `accent-soft` #1e2b22 | `on-accent` |
| Plum | Toji | `preset-plum` #b48aab | `preset-plum-strong` #c9a6c1 | `preset-plum-soft` #2b1f29 | `on-accent` |
| Blue | Six Eyes | `preset-blue` #45b0d2 | `preset-blue-strong` #72c4df | `preset-blue-soft` #13272f | `on-accent` |
| Gold | Super Saiyan | `preset-gold` #f5d04a | `preset-gold-strong` #f9e08a | `preset-gold-soft` #2c2610 | `on-accent` |

With Plum, `cursed` also switches to `preset-plum-cursed` (Toji's tan, #eed0bb) and `cursed-soft` to `preset-plum-cursed-soft`, so the Toji theme is built only from Toji's palette: plum, tan and the slate cards. Blue (Six Eyes) keeps the violet. With Gold, `grade` switches to `preset-gold-grade` (platinum, #d3d8df) and `grade-soft` to `preset-gold-grade-soft`, because grade badges and goal lines are gold and would blend into a gold accent. All four keep accent text at 4.5:1 or better on every surface, card and soft tint in both themes; Gold's Light value is a deep gold (#745900, 5.0:1 on `surface-3` and `card-2`, the floor; 9.6:1 or better in Dark) because bright yellow fails on light grounds. In Dark, `on-accent` is near-black; in Light it is white, because the Light accents are deeper. Any new preset needs a value for each theme, must meet the same floors, and must not be a red or amber (those belong to `flash` and `stop`). Plum sits nearest to `flash` in hue, and Gold nearest to `stop` (in Light they have almost the same lightness); both are safe only because personal records always carry the bolt icon and "PR", and Stop always carries the octagon and the word.

## Themes

- **Dark** (default) and **Light** share every token name; only values differ. Set `data-theme="dark"` or `data-theme="light"` on the app shell; nothing else changes.
- Settings offers **System / Dark / Light**. System follows the phone (`prefers-color-scheme`) and is the default; the choice is stored per device.
- Light exists for bright gyms and outdoor cardio in sunlight, where a dark screen washes out. Its accents are deeper versions of the same hues, so every text color still passes 4.5:1 on every surface, card and soft tint, and colored fills carry white text (`on-…` tokens) at 6:1 or better.
- The slate cards stay a cool tint in Light (`card` #e6e9f1) so sections still separate from the warm off-white page, and `card-edge` (#a7b0c0 Light, #4a5368 Dark) outlines them against the page in both themes.
- Never hard-code a color for one theme. If something needs a new color, add a token with both values and check both.

## Typography

Two self-hosted families, served from this system's `fonts/` folder (SIL Open Font License); no Google Fonts request at runtime.

- **Barlow Condensed** (`--font-display`; 500, 600, 700) for headings, buttons and every number. Narrow digits let 142.5 fit in a 360 px row.
- **Barlow** (`--font-body`; 400, 500, 600) for notes, descriptions and secondary lines.
- Styles: `timer` 64 for the rest countdown, `title` 28 for the exercise name, `value` 28 for field values, `heading` 20, `button` 18, `eyebrow` 13 uppercase; `body` 16, `body-strong` 16, `small` 14, `caption` 13. Nothing is smaller than 13 px.
- Set every number with `font-variant-numeric: tabular-nums` (class `hr-num`) so digits don't jump while a timer runs or a value steps.

## Layout, size and touch

- Side gutter `space-4` (16 px). Gaps between cards `space-5`.
- **Tap targets:** at least `tap-min` (44 × 44 px) for anything tappable, icon buttons included; `tap-row` (56 px) for set rows, fields, steppers and in-workout buttons; `tap-hero` (64 px) for the Log set button. At least `space-2` (8 px) between neighboring targets.
- The primary action lives in a sticky bottom action bar (`surface-1`, `shadow-sheet`) within thumb reach. Destructive or ending actions (Stop) sit at the top, away from it.
- Radii: `radius-sm` chips and badges, `radius-md` controls and rows, `radius-lg` cards and sheet tops, `radius-pill` toggles and the timer pill.

## Motion

- Durations: `duration-fast` (150 ms) for press feedback, `duration-base` (200 ms) for state changes, `duration-slow` (300 ms) for sheets and the PR banner. Nothing longer than 300 ms; nothing loops except the rest timer itself.
- Easing: `ease-out` for entering and settling, `ease-in-out` for things moving in place.
- Honor `prefers-reduced-motion`: `bundle.css` cuts every transition and animation to 1 ms and drops the press scale.

## Focus and states

- Focus ring: 2 px solid `focus` (an alias of `text`) with a 2 px offset, on every control. It is the text ink of the current theme, so it shows against accent, flash and stop fills alike.
- Pressed: one surface step up (`surface-2` → `surface-3`) or `accent-strong` on accent fills. No hover-only affordances; this is a touch app.

## Charts

Progress charts follow the bundled chart method: one job per chart, color last, checked contrast.

- **One series and one y-axis per chart.** Bodyweight, waist and a lift's estimated 1RM are filled lines; cardio minutes are teal bars. Never two measures on two scales; split them into two charts.
- **The one multi-line chart: % gain** (Progress › Lift). Up to five lifts on one % scale, each the % change in est. 1RM from its first session in the period (one measure, one axis). Lines 2 px in `accent`, `cursed`, `recover`, `grade`, `text-2`, in that order (no area fill); points only at each line's two ends; a **direct label at the right end of each line** (name, then the value, in `text`, with a short tick in the line's color), labels pushed apart so none overlap; no legend box. Color is never the only cue: the label names the line, and the list row it came from shows the same tick. Assisted lifts are inverted (less assistance is a gain) and labeled "assist". The 0% gridline is drawn in `border-strong`.
- **Line:** 2 px `accent`, area fill `accent-soft`, points 5 px radius with a `card` center; the selected point grows to 7 px. **Bars:** `recover`, 4 px rounded tops, a planned bar is `recover-soft` with a dashed edge.
- **Y-axis:** the data's range plus about 10% on each side (the goal line included), never below 0 for weights, reps, seconds and minutes; two to four gridlines on round numbers inside that range. Only a % change chart may go below 0.
- **Goal or target:** a dashed 2 px `grade` line labeled at its right end ("Goal 185", "Grade 1 · 190", "Target 345").
- **Labels:** every point when there are 6 or fewer, otherwise first, last, highest and lowest. Values in `text`, axes in `text-2`, never in the series color.
- **Signals on charts:** personal-record points `flash` (the PR dot), stop events as an amber octagon on the axis with the line skipping that session.
- **Interaction:** tapping a point or bar updates the readout above the chart (value, date, change over the period). Hit areas are 18 px radius, larger than the mark.
- **Readout first:** the big number above the chart is the headline; the chart explains it. A single-series chart has no legend box; its title names it.
- **Accessibility:** every chart has an `aria-label` that states the measure, period, first and last values and the goal.
- **Sets per muscle group:** one `cursed` bar per muscle with a `grade` tick at the target. Muscles are told apart by their labels, so there is no per-muscle color palette.

## Iconography

- **SVG icons only, never emoji or icon fonts.** 24 × 24 grid, 2 px stroke, round caps and joins, no fills except dots. They are original simple glyphs drawn for this system, in the Icons asset group.
- In the app, inline the SVG with `class="hr-icon"` so it inherits `currentColor` through `bundle.css`. The asset files are drawn in `text` (`#e9edea`) for previews only.
- Icon meanings are fixed: `check` done, `partial` partly done, `bolt` personal record, `stop` stop event, `swap` swap, `later` move to the bottom, `skip` skipped, `pin` pinned note, `note` session note, `timer` rest, `play` form video, `pulse` cardio, `moon` recovery day, `scale` bodyweight, `tape` waist, `dumbbell` a lift, `calendar` / `library` / `progress` the three nav destinations, `search`, `photo`, `external` opens in Brave, `chevron-down` / `chevron-right`. `chain` is a small chain glyph for in-app use; it is not the app icon.
- Decorative icons get `aria-hidden="true"`; an icon-only button gets an `aria-label`.

## App icon

- **The icon:** a short straight blade, point up, with a chain wrapped around the handle and trailing off to the right, and a four-pointed spark beside the tip. Blade and chain in `accent` green (#7fa889), the spark in `flash` red (#f55c70), on the dark `bg` (#0b0d0c). It is in the Brand asset group (`app-icon.svg`).
- **Fixed colors.** The icon stays green and red whatever accent preset is chosen in Settings, and in both themes; app icons don't follow in-app themes.
- **Full-bleed and maskable.** The SVG is 1024 × 1024 with the dark background filling the square; the artwork stays inside the central 80% circle (it reaches 76%), so Android's round and shaped launcher masks never cut it. Don't add rounded corners to the file; the launcher applies its own shape.
- **Sizes** are generated from the one SVG: 192 and 512 (any and maskable), a 180 apple-touch-icon, and 32 and 16 favicons.
- **Origin.** Generated with an AI image tool from an original-design prompt, then redrawn by hand: exact token colors, centered for the safe zone, thickened strokes and a larger spark for small sizes. It is a generic blade and chain, not a copy of any anime weapon or character.
- **Social preview.** The GitHub social preview card (1280 × 640) pairs the icon and name with two demo-data screenshots on the dark `bg`.

## Building with it

The app is built with Svelte 5, but the components stay plain CSS classes, not a JS bundle, so any markup can use them. Load `tokens.css` then `components/bundle.css`, put `class="hr-root"` and `data-theme` on the app shell, and use the markup in each component's preview. Every class name starts with `hr-`.

The five screen designs (Today's workout, set logging, exercise card, progress, library) live in the "Heavenly Restriction — App Screens" design canvas and are built only from these tokens and classes. Where a screen and this README disagree, this README wins.

## Credits

- The app is credited to its author in this order everywhere it is named: full name first, GitHub handle second. **Carl Lochstampfor**, then **CLochstampfor60**.
- In the app: Settings › About reads "Design and development by Carl Lochstampfor (CLochstampfor60)." (`body-strong`), then "CLochstampfor60 on GitHub" (`small`, `text-2`) linking to the profile, then "Built with help from Claude by Anthropic." (`small`, `text-2`). The author line always comes first; the Claude line always sits below it.
- In the repo: the README's Credits section repeats the same two lines in the same order: "Design and development by Carl Lochstampfor (CLochstampfor60)." then "Built with help from Claude by Anthropic." The MIT `LICENSE` copyright line ("Copyright (c) 2026 Carl Lochstampfor (CLochstampfor60)") and the web app manifest's author field name the author only.
