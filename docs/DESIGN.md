# Heavenly Restriction — Design handoff

Read this before building any screen. It points to the design system in `design-system/` and describes the MVP screens.
Design by Carl Lochstampfor (CLochstampfor60), October 2026.

## Rules that override everything

0. **At the gym: fewest taps, least typing, least thinking.** Show plenty of data, ask for little input. No confirmation dialogs except Stop and Finish workout. Workouts are never linear: no exercise state locks logging.

1. **Build only from `design-system/`.** Every color, size, radius and duration is a token in `design-system/tokens.json` (compiled to `tokens.css`). Components are plain CSS classes in `design-system/components/bundle.css`, all prefixed `hr-`. Never hard-code a hex value or a pixel size the tokens already name.
2. **Where a screen reference and `design-system/README.md` disagree, the README wins.**
3. **Two themes, same token names.** Dark (default) and Light. Set `data-theme="dark"` or `data-theme="light"` on the app shell. Settings offers System / Dark / Light; System follows `prefers-color-scheme` and is the default; store the choice per device. Apply the stored theme before first paint (a tiny synchronous script in `<head>`) so there is no flash.
4. **Accent presets.** Settings › Accent offers Green (default, "Cursed Energy"), Plum ("Toji"), Blue ("Six Eyes") and Gold ("Super Saiyan"). A preset overrides only `--accent`, `--accent-strong`, `--accent-soft` on the shell; Plum also swaps `--cursed` and `--cursed-soft` to the `preset-plum-cursed…` tokens, and Gold swaps `--grade` and `--grade-soft` to the platinum `preset-gold-grade…` tokens so grade badges don't blend into the accent. See the README's accent table.
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
- Exercise list in program order (`hr-exrow`). **Every row opens the pager at that exercise** (the row body is the link); cardio rows too. Rows show progress in the meta line ("2 of 4 sets"): done (check + Done chip), in progress (violet edge + half-filled `partial` mark), upcoming (Later and Swap icon buttons), swapped (swap mark + "Swapped from …"), stopped (octagon mark, "Stopped · <symptom>" line, compact **Undo stop** button).
- Later moves the exercise to the bottom. Swap opens a bottom sheet (`hr-sheet`): the exercise's ranked substitutions first, then same-muscle options; the set is logged under the exercise actually done.
- Bottom: primary button, compact size (Start workout / Continue: <exercise> / Finish workout) and `hr-nav` (Today, Library, Progress). Start workout and Continue open the pager at the first required page not yet ended (warm-up and cardio count); once every required exercise has ended, the button is Finish workout. Once the workout has begun, a secondary Finish workout button sits under the hero; with exercises still open it asks first in a sheet ("N exercises not done", Cancel / Finish): untouched required exercises become Skipped, a started one keeps its logged sets. Logging anything afterwards reopens the workout.

### 2. Set logging: the exercise pager (`Main.dc.html` for one page)
Set logging is a pager, one page per item of today in Today's order (Later order respected): warm-up, main lifts, core, forearm block, cardio (after the forearm block), cool-down. Moving between pages changes nothing: leaving a page never starts, pauses or skips anything.

- **Always-visible header** (`pager-top`, above every sheet's scrim so it works with a sheet open): **Today** (calendar icon + word, top left) returns to Today from any page, with any sheet open, a timer running or a sync pending, and never loses a logged set; small previous / next arrows (44 px, `aria-label`s) beside an **"N of M"** button that opens a bottom sheet listing every page (status mark, name, "2 of 4 sets" / Done / Stopped / Skipped) to jump to. The Android back gesture also returns to Today in one step: page changes replace the history entry instead of adding one.
- **Swipe** the page body left or right to move one page (a quarter of the width, or a quick flick; the ends resist). A swipe never starts within 24 px of the screen edges (Android's back gesture), on the steppers, inputs or the RIR picker, or on the bottom panel. Under `prefers-reduced-motion` the page changes without sliding.
- **Exercise page header:** a 56 px placeholder tile (`media-ph`: the exercise's initials on `cursed-soft`; an icon for cardio and cool-down) where the media bar will go, block eyebrow, exercise name (links to its card), amber Stop button top-right (far from Log set), region tag and plan, save status, a status chip (Done / Stopped / Skipped) with "N of M sets", and Swap until the first set is logged. A stopped exercise shows "Stopped: <symptom> at <load>, set N" and a compact **Undo stop**.
- Pinned note collapsed to one line (tap for more).
- Set rows (`hr-set`): done, PR (Black Flash), active (violet), upcoming with last session's values faded (`text-faded`), skipped, stopped. Tapping the check on the active row logs it with the faded values in one tap. Only the most recent set can be undone (tap its check).
- **Bottom panel:** rest timer pill when the timer is on and running (+15 s, Skip; violet ring, green at zero), weight and reps steppers (2.5 lb / 1 rep steps; placeholder = last time's value for that exercise and set number, so an unchanged set is one tap), a small **RIR** button that unfolds the optional RIR picker, and the hero **Log set N** (or **Log extra set N** once the plan is done). "Finish after N sets" appears for a set range. The bottom nav is hidden in the pager.
- **No state locks logging.** Any exercise can be logged at any time, whatever its state (untouched, partly done, Done, Skipped, Swapped, Stopped). Logging reopens a Skipped or Stopped exercise (its skipped sets are to do again; the stopped set stays on record) and a finished workout. An exercise marks itself Done when its last planned set is logged and still takes extra sets.
- **Checklist and cardio pages** (warm-up, cool-down, program lines without a set count, cardio): the same header with an icon tile, the plan or the cardio settings, pinned program notes, and a bottom panel of Skip / Done (tap again to undo).
- PR rule in the demo: estimated 1RM (Epley, w × (1 + r/30)) above the previous best → `pr` row + "New personal record" banner with `hr-jjk`-style "Black Flash" line.
- Stop is for symptoms only (moving on is a swipe). It opens the stop sheet (`hr-sheet--stop`): symptom choice (Pinch, Sharp pain, Numbness or tingling, Dull ache, Form breaking down, Other), the load and set it is saved with, optional note, Cancel / Stop and record. Recording ends the exercise; remaining sets show as skipped until something is logged. **Undo stop** deletes the stop event everywhere (history, calendar, records) and reopens the exercise as it was.

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

### 6. Settings (built from the same components; no canvas screen)
- Header with back to Today, then sections under `hr-eyebrow` labels, gym-relevant first.
- **Workout:** "Rest timer" `hr-toggle` with one explanatory line. On by default for a new account; saved to the account on the server and cached on the phone, so every device matches and it works offline. Off means no automatic start and no pill, ring or countdown anywhere; turning it off ends a running countdown.
- **Theme** (System / Dark / Light, `hr-seg`, per device), **Accent** (radio cards with swatch, plain name and `hr-jjk` name, per device), **About** (credits, in the order in Rule 8), **Sign-in and security** (passkeys, authenticator app, recovery codes, sign out), **Storage on this phone**, **Demo data** (toggle and Reset today's session).

## Not designed yet
The media bar on pager pages (photos and YouTube; design first), program editing (drag cards into days, saves a new program_version), login (passkey + TOTP), the Warmup Routine module (parked). Build these from the same components; ask before inventing new patterns or colors.
