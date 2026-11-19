"""Personal-record rules. frontend/src/prs.js mirrors these; change both together.

- The first time an exercise is logged is a baseline, never a PR.
- A set logged after a stop event for that exercise in the same session is never a PR.
- Weighted reps: estimated 1RM (Epley, w x (1 + r/30)) above the best before it.
- Bodyweight reps (no load): more reps than ever before at no load.
- Assisted (weight is the assistance): lower assistance is progress. A PR needs at least the
  slot's minimum reps, and no earlier set may have done as many reps or more with the same or
  less assistance.
- Timed (seconds): no earlier set may have held as long or longer with the same or more load.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class SetValue:
    weight: float | None
    reps: int | None = None
    seconds: int | None = None


def e1rm(weight: float, reps: int) -> float:
    return weight * (1 + reps / 30)


def is_pr(
    new: SetValue,
    prior: list[SetValue],
    *,
    assisted: bool = False,
    measure: str = "reps",
    rep_floor: int | None = None,
) -> bool:
    if not prior:
        return False
    w = new.weight or 0.0
    if measure == "seconds":
        if new.seconds is None:
            return False
        return not any((p.seconds or 0) >= new.seconds and (p.weight or 0.0) >= w for p in prior)
    if new.reps is None:
        return False
    if assisted:
        if rep_floor is not None and new.reps < rep_floor:
            return False
        return not any((p.reps or 0) >= new.reps and (p.weight or 0.0) <= w for p in prior)
    if w <= 0:
        unloaded = [p.reps or 0 for p in prior if not p.weight]
        return new.reps > max(unloaded, default=0) and bool(unloaded)
    best = max((e1rm(p.weight or 0.0, p.reps or 0) for p in prior), default=0.0)
    return e1rm(w, new.reps) > best + 0.01
