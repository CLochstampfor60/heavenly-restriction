# Button

Buttons for every action except stopping an exercise, which has its own StopButton.

**Classes:** `hr-btn` plus one of `hr-btn--primary`, `hr-btn--secondary`, `hr-btn--ghost`; size `hr-btn--hero` (64px, full width) or `hr-btn--compact` (44px). `hr-icon-btn` for icon-only buttons (44 × 44).

**The consumer provides:** a `<button>` element, a plain-language label in sentence case, and an optional leading icon from the Icons group (inline SVG, `class="hr-icon"`). Icon-only buttons need `aria-label`.

- One primary per screen region. On the set-logging screen it is **Log set** in the bottom action bar, at hero size.
- Secondary for Swap and other alternatives; ghost for low-stakes moves like Later.
- Default height is `tap-row` (56px). Never go below `hr-btn--compact` (44px). Keep `space-2` (8px) between neighbors.
- Labels stay plain: "Swap", not "Weapon Swap". JJK names belong in headers and sheets, not on buttons.
- Disabled uses `surface-2` and `text-2`, still readable; prefer hiding an action over disabling it.
