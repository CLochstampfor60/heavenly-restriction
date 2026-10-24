# BottomNav

The app's three destinations: Today, Library, Progress. Sticks to the bottom of the screen.

**Classes:** `hr-nav` containing three `hr-navlink` anchors; mark the current one with `aria-current="page"`.

**The consumer provides:** the three links and which is current.

- Plain labels only (no JJK names here). Each target is a full-width 56 px cell.
- Current item in `accent`; the others in `text-2`. Icon plus word, never icon alone.
- Hidden on the set-logging screen, where the bottom of the screen belongs to Log set.
