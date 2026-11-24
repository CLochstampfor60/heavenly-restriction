"""Workout timing from timestamps the app already has: nothing is entered by hand.

- A session runs from Start workout or its first logged set, whichever came first, to Finish
  workout, or to its last logged set if Finish was not tapped.
- An exercise in a session runs from its first to its last logged set (two sets at least).

Times are stored as naive UTC (SQLite keeps no time zone); the phone sends ISO times with an
offset, which are converted on the way in.
"""

from datetime import UTC, datetime, timedelta

# A time sent by the phone further off than this is not trusted; the server's clock is used.
FUTURE_SLACK = timedelta(minutes=5)
PAST_LIMIT = timedelta(days=7)


def to_db(dt: datetime) -> datetime:
    """Naive UTC, as stored."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(UTC).replace(tzinfo=None)
    return dt


def iso(dt: datetime | None) -> str | None:
    """Stored (naive UTC) or aware time -> ISO 8601 with Z, for the phone."""
    if dt is None:
        return None
    return to_db(dt).isoformat(timespec="seconds") + "Z"


def client_time(sent: datetime | None, now: datetime | None = None) -> datetime:
    """When a set was logged: the phone's time (it may sync much later), unless implausible."""
    now = to_db(now or datetime.now(UTC))
    if sent is None:
        return now
    t = to_db(sent)
    if t > now + FUTURE_SLACK or t < now - PAST_LIMIT:
        return now
    return t


def span_seconds(times: list[datetime]) -> int | None:
    """First to last of two or more times, in whole seconds."""
    times = [to_db(t) for t in times if t is not None]
    if len(times) < 2:
        return None
    return int((max(times) - min(times)).total_seconds())


def session_seconds(
    started_at: datetime | None,
    finished_at: datetime | None,
    finished: bool,
    set_times: list[datetime],
) -> int | None:
    """Start workout or the first set, to Finish workout or the last set."""
    sets = [to_db(t) for t in set_times if t is not None]
    starts = [to_db(started_at)] if started_at else []
    starts += sets
    if not starts:
        return None
    start = min(starts)
    if finished and finished_at:
        end = to_db(finished_at)
    elif sets:
        end = max(sets)
    else:
        return None
    if end <= start:
        return None
    return int((end - start).total_seconds())
