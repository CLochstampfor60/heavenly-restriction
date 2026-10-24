# Segmented

A row of 2–4 mutually exclusive options: chart range (Week, Month, Year) or chart measure (Top set, Est. 1RM).

**Classes:** `hr-seg` with `hr-seg__btn` children carrying `aria-pressed`.

- Selected segment raises to `card-2` with `text`; the others are `text-2`. 44 px tall.
- Offer only the options that make sense for the current data (bodyweight has no Week view).
