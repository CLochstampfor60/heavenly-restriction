"""Workout timing from timestamps: nothing entered by hand."""

from datetime import UTC, datetime, timedelta

from app.timing import client_time, iso, session_seconds, span_seconds, to_db
from tests.test_api import MON, ex_id, log, plan
from tests.test_progress import progress

NOW = datetime(2026, 11, 23, 23, 0, tzinfo=UTC)
T = to_db(NOW)


def test_client_time_trusts_the_phone_within_limits() -> None:
    sent = NOW - timedelta(hours=3)  # logged offline, synced later
    assert client_time(sent, NOW) == to_db(sent)
    assert client_time(None, NOW) == T
    assert client_time(NOW + timedelta(hours=1), NOW) == T  # clock far ahead: not trusted
    assert client_time(NOW - timedelta(days=8), NOW) == T
    eastern = datetime.fromisoformat("2026-11-23T17:30:00-05:00")
    assert client_time(eastern, NOW) == datetime(2026, 11, 23, 22, 30)  # stored as UTC


def test_session_and_exercise_spans() -> None:
    m = lambda k: T + timedelta(minutes=k)  # noqa: E731
    sets = [m(5), m(20), m(50)]
    assert session_seconds(m(0), m(60), True, sets) == 3600  # Start workout to Finish workout
    assert session_seconds(None, None, False, sets) == 45 * 60  # first to last set
    assert session_seconds(m(10), None, False, sets) == 45 * 60  # a set before Start counts
    assert (
        session_seconds(None, m(60), False, sets) == 45 * 60
    )  # reopened: Finish no longer ends it
    assert session_seconds(m(0), None, False, []) is None
    assert span_seconds([m(5), m(17)]) == 12 * 60
    assert span_seconds([m(5)]) is None
    assert iso(m(0)) == "2026-11-23T23:00:00Z"


def test_api_durations_from_phone_times(client) -> None:
    data = plan(client)
    pulldown = ex_id(data, "Demo Pulldown — wide grip")
    key = next(s["key"] for s in data["slots"] if s["exercise_id"] == pulldown)
    now = datetime.now(UTC)
    start = now - timedelta(minutes=50)
    for k, minutes in enumerate((45, 38, 30)):  # sets 7 and 8 minutes apart
        at = (now - timedelta(minutes=minutes)).isoformat()
        body = {"client_id": f"t/{k}", "slot_key": key, "exercise_id": pulldown, "set_index": k,
                "weight_lb": 100, "reps": 8, "logged_at": at}  # fmt: skip
        r = client.post(f"/api/sessions/{MON}/sets", json=body)
        assert r.status_code == 201
        assert r.json()["logged_at"].endswith("Z")
    finished = now - timedelta(minutes=10)
    s = client.put(
        f"/api/sessions/{MON}",
        json={
            "finished": True,
            "started_at": start.isoformat(),
            "finished_at": finished.isoformat(),
        },
    ).json()
    assert s["duration_s"] == 40 * 60  # Start workout to Finish workout
    assert client.put(f"/api/sessions/{MON}", json={"finished": True}).json()["started_at"]  # kept
    card = client.get(f"/api/exercises/{pulldown}").json()
    assert card["sessions"][-1]["duration_s"] == 15 * 60  # its first to last set
    assert progress(client, MON)["durations"] == {MON.isoformat(): 40 * 60}


def test_a_set_without_a_phone_time_uses_the_server_clock(client) -> None:
    data = plan(client)
    pulldown = ex_id(data, "Demo Pulldown — wide grip")
    key = next(s["key"] for s in data["slots"] if s["exercise_id"] == pulldown)
    r = log(client, MON, key, pulldown, 0, w=100, r=8)
    assert abs(datetime.fromisoformat(r.json()["logged_at"]) - datetime.now(UTC)) < timedelta(
        minutes=1
    )
