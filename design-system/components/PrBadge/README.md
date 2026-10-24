# PrBadge

Marks a personal record (Black Flash): a small badge for rows and charts, and a banner that appears once when the record is set.

**Classes:** `hr-pr` (solid `flash`), `hr-pr--quiet` (on `flash-soft`), and `hr-pr-banner` with `hr-pr-banner__icon`.

**The consumer provides:** the record type (weight, reps at weight, or estimated 1RM) and the values.

- `flash` means a personal record and nothing else. Never use it for errors, deletes or the stop button.
- Plain label first: the banner title is **New personal record**; "Black Flash" is the secondary line in `flash`.
- Always the bolt icon plus "PR" or the full words.
- The banner enters with `duration-slow` and `ease-out`, stays until the next set is logged, and never covers the Log set button.
