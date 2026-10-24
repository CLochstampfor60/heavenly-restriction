# Heavenly Restriction — Design handoff

Read this before building any screen. It points to the design system in `design-system/` and describes the five MVP screens.
Design by Carl Lochstampfor (CLochstampfor60), October 2026.

## Rules that override everything

1. **Build only from `design-system/`.** Every color, size, radius and duration is a token in `design-system/tokens.json` (compiled to `tokens.css`). Components are plain CSS classes in `design-system/components/bundle.css`, all prefixed `hr-`. Never hard-code a hex value or a pixel size the tokens already name.
2. **Where a screen reference and `design-system/README.md` disagree, the README wins.**
3. **Two themes, same token names.** Dark (default) and Light. Set `data-theme="dark"` or `data-theme="light"` on the app shell. Settings offers System / Dark / Light; System follows `prefers-color-scheme` and is the default; store the choice per device. Apply the stored theme before first paint (a tiny synchronous script in `<head>`) so there is no flash.
4. **Accent presets.** Settings › Accent offers Green (default, "Cursed Energy"), Plum ("Toji") and Blue ("Six Eyes"). A preset overrides only `--accent`, `--accent-strong`, `--accent-soft` on the shell; Plum also swaps `--cursed` and `--cursed-soft` to the `preset-plum-cursed…` tokens. See the README's accent table.
5. **Accessibility floors** (already met by every token pair in both themes; keep it that way): text 4.5:1, control edges and icons 3:1, tap targets at least 44 × 44 px with 8 px between them, SVG icons only (never emoji), motion 150–300 ms and off under `prefers-reduced-motion`.
6. **Plain label first, JJK name second.** JJK names appear only as a secondary line (`hr-jjk`) in headers, sheets and banners; never on buttons, fields or chips.
7. **Never color alone.** Every status carries an icon and a word (check + Done, bolt + PR, octagon + Stop, swap + Swapped, heart-pulse + Cardio, moon + Recovery).
8. **Credit** the app to Carl Lochstampfor first, then CLochstampfor60: README credit line, `LICENSE` copyright line ("Copyright (c) 2026 Carl Lochstampfor (CLochstampfor60)"), PWA manifest author, Settings › About. Exact wording in the README's Credits section.

## Using the design system

- Serve `design-system/fonts/` (Barlow and Barlow Condensed, SIL OFL 1.1 — keep `fonts/OFL.txt` alongside them). No Google Fonts request, so the CSP needs no font or style origins beyond `'self'` (the YouTube embed will need its own `frame-src` entry for youtube-nocookie.com).
- Load order: `tokens.css` → `components/bundle.css` → the app's own CSS (which may only reference tokens).
- Put `class="hr-root"` and `data-theme` on the shell element.
- Icons: `design-system/assets/Icons/*.svg`. Inline them with `class="hr-icon"` and change `stroke="#e9edea"` to `stroke="currentColor"` (the files are tinted only so they show in previews). Meanings are fixed; see the README's Iconography section.
- Each `design-system/components/<Name>/README.md` says what the consumer provides; each `preview.html` is the reference markup (it assumes `tokens.css` and `bundle.css` are already loaded).
- Phone target: Galaxy S23 in Brave, 360 × 780 CSS px. Layouts are fluid up to 360 px wide; test at 360.

## Screens

The visual reference is the "Heavenly Restriction — App Screens" design canvas in claude.ai. `docs/screens/*.dc.html` are that canvas's source files: markup plus demo logic in a `renderVals()` method. They run only inside the canvas, so read them for structure, class usage, states and the demo behavior; do not copy their inline styles where a `bundle.css` class exists. All data in them is made up.

### 1. Today's workout (`Today.dc.html`) — the app's home
- Header: "Today's workout: Pull A", `hr-jjk` "Today's Mission", date and program version, progress bar with "N of 6 done".
- "What I brought today": collapsible row of `hr-toggle` switches (Bands, Hip Halo, Straps). A missing item swaps the dependent exercise to its alternative with an `info` note; it is never counted as missed.
- Exercise list in program order (`hr-exrow`): done (check + Done chip), current (violet edge + Continue → set logging), upcoming (Later and Swap icon buttons), swapped (swap mark + "Swapped from …").
- Later moves the exercise to the bottom. Swap opens a bottom sheet (`hr-sheet`): the exercise's ranked substitutions first, then same-muscle options; the set is logged under the exercise actually done.
- Bottom: hero button (Start workout / Continue: <exercise> / Finish workout) and `hr-nav` (Today, Library, Progress).

### 2. Set logging (`Main.dc.html`)
- Header: back to Today, "Pull A · exercise 2 of 6", exercise name, amber Stop button top-right (far from Log set), region tag and plan, Later / Swap / Video.
- Pinned note collapsed to one line (tap for more).
- Set rows (`hr-set`): done, PR (Black Flash), active (violet), upcoming with last session's values faded (`text-faded`), skipped, stopped. Tapping the check on the active row logs it with the faded values in one tap.
- Bottom panel: rest timer pill (starts automatically on log; +15 s, Skip; violet ring, green at zero), weight and reps steppers (2.5 lb / 1 rep steps; placeholder = last time's value for that exercise and set number), optional RIR picker, hero "Log set N". The bottom nav is hidden on this screen.
- PR rule in the demo: estimated 1RM (Epley, w × (1 + r/30)) above the previous best → `pr` row + "New personal record" banner with `hr-jjk`-style "Black Flash" line.
- Stop opens the stop sheet (`hr-sheet--stop`): symptom choice (Pinch, Sharp pain, Numbness or tingling, Dull ache, Form breaking down, Other), the load and set it is saved with, optional note, Cancel / Stop and record. Recording ends the exercise; remaining sets show as skipped.

### 3. Exercise card (`ExerciseCard.dc.html`)
- Header "Exercise library" / "Inventory", name, region tag, secondary muscles; three `hr-stat` cards (Best, Est. 1RM, Plan).
- Form media: privacy-enhanced YouTube player area plus a row of own clips (teal Offline badge), photos and external links ("Opens in Brave").
- Notes: pinned cue, pinned load cap (`hr-jjk` "Binding Vow"), last session note.
- History chart (see README › Charts): Top set / Est. 1RM toggle, PR points in `flash`, stop events as an amber octagon on the axis, tap a point for the readout.
- Recent sessions (stop session tinted `stop-soft`), ranked substitutions.

### 4. Progress (`Progress.dc.html`)
- This week: sessions N of 5 (segmented meter), cardio minutes vs 345 target (teal meter).
- Measurement switch (Weight, Waist, Lift, Cardio) + Week / Month / Year (only the ranges that make sense per measurement), period arrows, readout, chart with dashed `grade` goal line. Cardio is teal bars; a planned bar is dashed.
- Sets per muscle group this week: one `cursed` bar per muscle with a `grade` tick at the target.
- Month calendar (`hr-cal` / `hr-day`) with legend; PR days get a red dot; today is outlined.
- Recent records with `hr-grade` badges and the plain "Level N of 5" line.

### 5. Exercise library (`Library.dc.html`)
- Header "Exercise library" / "Inventory · N exercises", New button, search field, filter chips (All, In my program, Has video, Excluded).
- Regions expand and collapse; inside, muscles as `hr-tag` groups; rows show equipment, last top set, video mark, grade badge, program day; substitutes labeled; excluded exercises dashed and hidden unless that filter is on.

## Not designed yet
Settings (theme, accent, About/credits), program editing (drag cards into days, saves a new program_version), login (passkey + TOTP), the Warmup Routine module (parked). Build these from the same components; ask before inventing new patterns or colors.
