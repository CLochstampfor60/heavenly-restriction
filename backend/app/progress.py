"""Progress from real logs: the week, the month calendar, charts, sets per muscle, records.

Day status (calendar and week meter):
- stop:    a stop event that day.
- done:    every required slot (loggable, not optional) ended, or the workout was finished.
- partial: something logged or ticked, but not all of the above.
- skip:    a past lifting day with nothing logged.
- cardio:  a non-lifting day with cardio ticked done.
- rest:    a past non-lifting day without cardio.
Days before the first session ever have no status, so a new install is not a wall of skips.
"""

from calendar import monthrange
from collections import defaultdict
from datetime import date as Date
from datetime import timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api import DAY_NAMES, DB, active_version, list_metrics
from app.models import (
    Exercise,
    ProgramDay,
    ProgramVersion,
    SetLog,
    StopEvent,
    WorkoutSession,
)
from app.prs import e1rm
from app.timing import session_seconds

router = APIRouter(prefix="/api")

ENDED = {"done", "stopped", "skipped"}


def month_start(d: Date, back: int = 0) -> Date:
    y, m = d.year, d.month - back
    while m < 1:
        y, m = y - 1, m + 12
    return Date(y, m, 1)


def required_keys(day: ProgramDay | None) -> set[str]:
    if day is None:
        return set()
    return {s.key for s in day.slots if s.loggable and not s.optional}


def cardio_minutes(
    day: ProgramDay | None, statuses: dict, only_done: bool, log: dict | None = None
) -> int:
    """Planned minutes, or done ones: the logged minutes when the item has them, else the
    program's."""
    if day is None:
        return 0
    total = 0.0
    for k, entry in enumerate(day.cardio):
        key = f"cardio{k + 1}"
        if not only_done or statuses.get(key) == "done":
            logged = (log or {}).get(key, {}).get("minutes") if only_done else None
            total += logged if logged is not None else (entry.minutes_min or 0)
    return round(total)


def session_value(ex: Exercise, sets: list[SetLog]) -> float | None:
    """One number per session for the lift chart, by the exercise's PR rule."""
    if not sets:
        return None
    if ex.measure == "seconds":
        return max((s.seconds or 0) for s in sets)
    if ex.is_assisted:
        return min((s.weight_lb or 0) for s in sets)
    if all(not s.weight_lb for s in sets):
        return max((s.reps or 0) for s in sets)
    return max(e1rm(s.weight_lb or 0, s.reps or 0) for s in sets)


@router.get("/progress")
def progress(date: Date, db: DB) -> dict:
    version = active_version(db)
    days_by_weekday: dict[int, ProgramDay] = {}
    if version is not None:
        days_by_weekday = {d.weekday: d for d in version.days}
    lifting = sorted(wd for wd, d in days_by_weekday.items() if required_keys(d))

    sessions = {s.date: s for s in db.scalars(select(WorkoutSession))}
    first_ever = min(sessions) if sessions else None
    stops = {s.session_id for s in db.scalars(select(StopEvent))}
    logged = set(db.scalars(select(SetLog.session_id).distinct()))

    def day_of(d: Date) -> ProgramDay | None:
        s = sessions.get(d)
        if s is not None and s.program_day_id:
            return db.get(ProgramDay, s.program_day_id)
        return days_by_weekday.get(d.weekday())

    def status(d: Date) -> str | None:
        if d > date or first_ever is None or d < first_ever:
            return None
        day = day_of(d)
        need = required_keys(day)
        s = sessions.get(d)
        cardio_done = bool(s and any(v == "done" for v in (s.cardio or {}).values()))
        if s is not None:
            if s.id in stops:
                return "stop"
            by_key = {x.slot_key: x.status for x in s.slots}
            if need and (s.finished or all(by_key.get(k) in ENDED for k in need)):
                return "done"
            touched = s.id in logged or any(v != "todo" for v in by_key.values())
            if need and touched:
                return "partial"
        if need:
            return "skip" if d < date else None
        if cardio_done:
            return "cardio"
        return "rest" if d < date else None

    # ---- this week (Mon-Sun) and the month calendar
    monday = date - timedelta(days=date.weekday())
    week = [
        {"date": (monday + timedelta(days=wd)).isoformat(), "day": DAY_NAMES[wd],
         "status": status(monday + timedelta(days=wd))}
        for wd in lifting
    ]  # fmt: skip
    first = date.replace(day=1)
    calendar = {}
    for k in range(monthrange(date.year, date.month)[1]):
        d = first + timedelta(days=k)
        calendar[d.isoformat()] = status(d)

    # ---- workout time per day (this month and this week), from timestamps: nothing entered
    set_times: dict[int, list] = defaultdict(list)
    for session_id, at in db.execute(select(SetLog.session_id, SetLog.logged_at)):
        set_times[session_id].append(at)
    durations = {}
    for d in sorted(
        {first + timedelta(days=k) for k in range(len(calendar))}
        | {monday + timedelta(days=k) for k in range(7)}
    ):
        s = sessions.get(d)
        if s is None or d > date:
            continue
        seconds = session_seconds(s.started_at, s.finished_at, s.finished, set_times[s.id])
        if seconds:
            durations[d.isoformat()] = seconds

    # ---- cardio: planned target from the program, done from ticks
    target = sum(cardio_minutes(d, {}, only_done=False) for d in days_by_weekday.values())

    def cardio_done_on(d: Date) -> int:
        s = sessions.get(d)
        if not s:
            return 0
        return cardio_minutes(day_of(d), s.cardio or {}, only_done=True, log=s.cardio_log)

    cardio_week = []
    for wd in range(7):
        d = monday + timedelta(days=wd)
        planned = cardio_minutes(day_of(d), {}, only_done=False) if d > date else 0
        cardio_week.append([DAY_NAMES[wd][0], cardio_done_on(d), planned or None])
    cardio_month = []
    wk = first - timedelta(days=first.weekday())
    while wk <= date:
        total = sum(cardio_done_on(wk + timedelta(days=i)) for i in range(7))
        cardio_month.append([f"{wk.month}/{wk.day}", total])
        wk += timedelta(days=7)
    cardio_year = []
    for back in range(11, -1, -1):
        m0 = month_start(date, back)
        n = monthrange(m0.year, m0.month)[1]
        total = sum(cardio_done_on(m0 + timedelta(days=i)) for i in range(n))
        if total:
            cardio_year.append(
                [m0.strftime("%b")[0], round(total / (n / 7)), None, m0.strftime("%b %Y")]
            )

    # ---- lift: the exercise with the most sessions in the last 90 days
    since = date - timedelta(days=90)
    rows = db.execute(
        select(SetLog.exercise_id, func.count(func.distinct(SetLog.session_id)))
        .join(WorkoutSession)
        .where(WorkoutSession.date >= since, WorkoutSession.date <= date)
        .group_by(SetLog.exercise_id)
        .order_by(func.count(func.distinct(SetLog.session_id)).desc(), SetLog.exercise_id)
    ).first()
    lift = None
    if rows is not None:
        ex = db.get(Exercise, rows[0])
        per_session: dict[Date, list[SetLog]] = defaultdict(list)
        for s in db.scalars(select(SetLog).join(WorkoutSession).where(SetLog.exercise_id == ex.id)):
            per_session[db.get(WorkoutSession, s.session_id).date].append(s)
        points = sorted((d, session_value(ex, sets)) for d, sets in per_session.items())
        this_month = (date.year, date.month)
        month_pts = [
            [f"{d.month}/{d.day}", round(v, 1)]
            for d, v in points
            if (d.year, d.month) == this_month
        ]
        year_pts = []
        for back in range(11, -1, -1):
            m0 = month_start(date, back)
            vals = [v for d, v in points if (d.year, d.month) == (m0.year, m0.month)]
            if vals:
                best = min(vals) if ex.is_assisted else max(vals)
                year_pts.append([m0.strftime("%b")[0], round(best, 1), None, m0.strftime("%b %Y")])
        if ex.measure == "seconds":
            label, unit = "longest hold", "s"
        elif ex.is_assisted:
            label, unit = "least assistance", "lb"
        else:
            label, unit = "est. 1RM", "lb"
        lift = {
            "exercise_id": ex.id,
            "name": f"{ex.name} · {label}",
            "unit": unit,
            "assisted": ex.is_assisted,
            "month": month_pts,
            "year": year_pts,
        }

    # ---- every lift of the last 12 months, set by set, for the Lift tab ("Your lifts", the
    # Pounds and % gain charts). The phone works out est. 1RM, PRs and periods itself, so a set
    # deleted offline drops out of every view at once.
    year_ago = date - timedelta(days=365)
    lift_rows = db.execute(
        select(SetLog, WorkoutSession.date)
        .join(WorkoutSession, WorkoutSession.id == SetLog.session_id)
        .where(WorkoutSession.date >= year_ago, WorkoutSession.date <= date)
        .order_by(WorkoutSession.date, SetLog.set_index)
    ).all()
    stop_rows = db.execute(
        select(StopEvent, WorkoutSession.date)
        .join(WorkoutSession, WorkoutSession.id == StopEvent.session_id)
        .where(WorkoutSession.date >= year_ago, WorkoutSession.date <= date)
    ).all()
    by_ex: dict[int, dict[Date, dict]] = defaultdict(dict)
    for s, d in lift_rows:
        sess = by_ex[s.exercise_id].setdefault(d, {"date": d.isoformat(), "sets": [], "stop": None})
        sess["sets"].append({"id": s.client_id, "w": s.weight_lb, "r": s.reps, "s": s.seconds})
    for st, d in stop_rows:
        sess = by_ex[st.exercise_id].setdefault(
            d, {"date": d.isoformat(), "sets": [], "stop": None}
        )
        sess["stop"] = {"w": st.weight_lb, "symptom": st.symptom}
    lifts = []
    for ex_id, per_day in by_ex.items():
        ex = db.get(Exercise, ex_id)
        if ex is None or ex.routine:
            continue
        lifts.append(
            {
                "exercise_id": ex.id,
                "name": ex.name,
                "assisted": ex.is_assisted,
                "measure": ex.measure,
                "per_side": ex.per_side,
                "sessions": [per_day[d] for d in sorted(per_day)],
            }
        )

    # ---- sets per muscle group this week
    muscle = db.execute(
        select(func.coalesce(Exercise.region, "Other"), func.count(SetLog.id))
        .join(SetLog, SetLog.exercise_id == Exercise.id)
        .join(WorkoutSession, WorkoutSession.id == SetLog.session_id)
        .where(WorkoutSession.date >= monday, WorkoutSession.date <= date)
        .group_by(Exercise.region)
        .order_by(func.count(SetLog.id).desc())
    ).all()

    # ---- records: each exercise's latest PR, newest first
    latest: dict[int, tuple[Date, SetLog]] = {}
    for s in db.scalars(select(SetLog).where(SetLog.is_pr)):
        d = db.get(WorkoutSession, s.session_id).date
        if s.exercise_id not in latest or d >= latest[s.exercise_id][0]:
            latest[s.exercise_id] = (d, s)
    records = []
    for ex_id, (d, s) in sorted(latest.items(), key=lambda kv: kv[1][0], reverse=True)[:8]:
        ex = db.get(Exercise, ex_id)
        records.append(
            {
                "exercise_id": ex_id,
                "name": ex.name,
                "date": d.isoformat(),
                "set": {"w": s.weight_lb, "r": s.reps, "s": s.seconds},
                "assisted": ex.is_assisted,
                "measure": ex.measure,
                "per_side": ex.per_side,
            }
        )
    pr_days = sorted(
        {
            d.isoformat()
            for (d,) in db.execute(
                select(WorkoutSession.date).join(SetLog).where(SetLog.is_pr).distinct()
            )
        }
    )

    # ---- body metrics: raw entries for the last 12 months; the phone charts them, merged with
    # any entries it has not synced yet.
    body_entries = list_metrics(db, start=month_start(date, 11), end=date)["entries"]

    return {
        "date": date.isoformat(),
        "version": version.label if isinstance(version, ProgramVersion) else None,
        "lifting_weekdays": lifting,
        "week": week,
        "calendar": calendar,
        "durations": durations,
        "lifts": lifts,
        "pr_days": pr_days,
        "cardio": {
            "target": target,
            "week": cardio_week,
            "month": cardio_month,
            "year": cardio_year,
        },
        "lift": lift,
        "body_entries": body_entries,
        "muscle_sets": [[name, n] for name, n in muscle],
        "records": records,
    }
