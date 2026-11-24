"""Progress from real logs, on the made-up demo program (Mon, Wed, Thu lifting; Sat, Sun extras)."""

from datetime import timedelta

from tests.test_api import MON, ex_id, log, plan

WED = MON + timedelta(days=2)


def progress(client, on=WED):
    r = client.get("/api/progress", params={"date": on.isoformat()})
    assert r.status_code == 200
    return r.json()


def test_empty(client) -> None:
    p = progress(client)
    assert p["lifting_weekdays"] == [0, 2, 3]
    assert p["records"] == [] and p["lift"] is None and p["muscle_sets"] == []
    assert all(v is None for v in p["calendar"].values())  # nothing before the first session
    # Weekly target = every program day's cardio minutes (10+15, 10+15, 20+20, 40).
    assert p["cardio"]["target"] == 130


def test_week_calendar_records_and_lift(client) -> None:
    pulldown = ex_id(plan(client), "Demo Pulldown — wide grip")
    log(client, MON, "1", pulldown, 0, w=100, r=10)
    log(client, MON, "1", pulldown, 1, w=105, r=10)  # PR
    p = progress(client)
    cal = p["calendar"]
    assert cal["2026-11-15"] is None  # before the first session
    assert cal["2026-11-16"] == "partial"
    assert cal["2026-11-17"] == "rest"  # no lifting on Tue in this program
    assert cal["2026-11-18"] is None  # today, nothing yet
    assert [w["status"] for w in p["week"]] == ["partial", None, None]
    assert p["pr_days"] == ["2026-11-16"]
    assert p["records"][0]["name"] == "Demo Pulldown — wide grip"
    assert p["records"][0]["set"] == {"w": 105, "r": 10, "s": None}
    assert p["muscle_sets"] == [["Back", 2]]
    assert p["lift"]["exercise_id"] == pulldown
    assert p["lift"]["month"] == [["11/16", 140.0]]  # 105 x (1 + 10/30)


def test_stop_and_done_and_skip(client) -> None:
    pulldown = ex_id(plan(client), "Demo Pulldown — wide grip")
    log(client, MON, "1", pulldown, 0, w=100, r=10)
    stop = {"client_id": "s1", "slot_key": "1", "exercise_id": pulldown, "set_index": 1,
            "weight_lb": 100, "symptom": "Pinch"}  # fmt: skip
    client.post(f"/api/sessions/{MON}/stops", json=stop)
    thu = MON + timedelta(days=3)
    assert progress(client, thu)["calendar"]["2026-11-16"] == "stop"
    assert progress(client, thu)["calendar"]["2026-11-18"] == "skip"  # Wed, nothing logged
    client.put(f"/api/sessions/{WED}", json={"finished": True})
    assert progress(client, thu)["calendar"]["2026-11-18"] == "done"


def test_cardio_ticks_sync_and_count(client) -> None:
    sat = MON + timedelta(days=5)
    r = client.put(
        f"/api/sessions/{MON}", json={"cardio": {"cardio1": "done", "cardio2": "skipped"}}
    )
    assert r.json()["cardio"] == {"cardio1": "done", "cardio2": "skipped"}
    r = client.put(f"/api/sessions/{sat}", json={"cardio": {"cardio1": "done", "cardio2": "done"}})
    p = progress(client, sat + timedelta(days=1))
    week = p["cardio"]["week"]
    assert week[0][1] == 10  # Mon: air bike only
    assert week[5][1] == 40  # Sat: both
    assert p["calendar"]["2026-11-21"] == "cardio"  # Sat has no required lifting
    bad = {"cardio": {"cardio1": "maybe"}}
    assert client.put(f"/api/sessions/{MON}", json=bad).status_code == 422


def test_assisted_lift_is_least_assistance(client) -> None:
    pull = ex_id(plan(client), "Assisted Demo Pull-Up")
    log(client, MON, "2", pull, 0, w=50, r=8)
    log(client, MON, "2", pull, 1, w=45, r=8)
    log(client, MON, "2", pull, 2, w=55, r=8)
    p = progress(client)
    assert p["lift"]["assisted"] is True and p["lift"]["month"] == [["11/16", 45]]


def test_cardio_minutes_use_what_was_logged(client) -> None:
    from tests.test_api import MON

    plan(client, MON)
    body = {
        "cardio": {"cardio1": "done", "cardio2": "done"},
        "cardio_log": {"cardio1": {"type": "air_bike", "minutes": 33, "level": 7}},
    }
    s = client.put(f"/api/sessions/{MON}", json=body).json()
    assert s["cardio_log"]["cardio1"] == {
        "type": "air_bike",
        "minutes": 33.0,
        "incline": None,
        "mph": None,
        "level": 7.0,
    }
    # Monday's program: 10 + 15 minutes. cardio1 was logged as 33; cardio2 keeps its 15.
    assert progress(client, MON)["cardio"]["week"][0][1] == 33 + 15
    # An older app copy sends no cardio_log: the log stays.
    assert (
        client.put(f"/api/sessions/{MON}", json={"cardio": {"cardio1": "done"}}).json()[
            "cardio_log"
        ]["cardio1"]["minutes"]
        == 33
    )
    bad = {"cardio_log": {"cardio1": {"type": "rowing"}}}
    assert client.put(f"/api/sessions/{MON}", json=bad).status_code == 422
    bad = {"cardio_log": {"cardio1": {"type": "bike", "minutes": -5}}}
    assert client.put(f"/api/sessions/{MON}", json=bad).status_code == 422
