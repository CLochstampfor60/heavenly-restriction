"""Deleting a logged set from history: PRs and records are worked out again; the day stays."""

from datetime import timedelta

from tests.test_api import MON, ex_id, log, plan
from tests.test_progress import progress


def test_delete_a_set_recomputes_prs_and_leaves_the_session(client) -> None:
    data = plan(client)
    pulldown = ex_id(data, "Demo Pulldown — wide grip")
    key = next(s["key"] for s in data["slots"] if s["exercise_id"] == pulldown)
    weeks = [MON, MON + timedelta(days=7), MON + timedelta(days=14)]
    for day in weeks:
        plan(client, day)
    log(client, weeks[0], key, pulldown, 0, w=100, r=8)
    assert log(client, weeks[1], key, pulldown, 0, w=120, r=8).json()["is_pr"] is True
    assert log(client, weeks[2], key, pulldown, 0, w=110, r=8).json()["is_pr"] is False
    done = {"slots": {key: {"status": "done", "done_as": pulldown}}}
    client.put(f"/api/sessions/{weeks[1]}", json=done)

    assert client.delete(f"/api/sets/{weeks[1]}/{key}/0").status_code == 204
    sessions = client.get(f"/api/exercises/{pulldown}").json()["sessions"]
    sets = {s["date"]: s["sets"] for s in sessions}
    assert str(weeks[1]) not in sets  # gone from history
    assert sets[str(weeks[2])][0]["is_pr"] is True  # 110 is the best now
    records = progress(client, weeks[2])["records"]
    assert [(r["exercise_id"], r["set"]["w"]) for r in records] == [(pulldown, 110.0)]
    # The day keeps its state; deleting again (a retry) is fine.
    day = client.put(f"/api/sessions/{weeks[1]}", json={}).json()
    assert day["slots"][key]["status"] == "done"
    assert client.delete(f"/api/sets/{weeks[1]}/{key}/0").status_code == 204


def test_delete_needs_a_session(anon) -> None:
    assert anon.delete("/api/sets/x").status_code in (401, 403)
