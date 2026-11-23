"""API tests against the made-up demo program."""

from datetime import date, timedelta

from app.prs import SetValue, is_pr

MON = date(2026, 11, 16)
WED = MON + timedelta(days=2)
assert MON.weekday() == 0


def plan(client, on=MON):
    r = client.get("/api/today", params={"date": on.isoformat()})
    assert r.status_code == 200
    return r.json()


def ex_id(data, name):
    return next(e["id"] for e in data["exercises"].values() if e["name"] == name)


def log(client, on, slot, exercise, k, w=None, r=None, s=None, cid=None):
    body = {"client_id": cid or f"{on}/{slot}/{k}", "slot_key": slot, "exercise_id": exercise,
            "set_index": k, "weight_lb": w, "reps": r, "seconds": s}  # fmt: skip
    return client.post(f"/api/sessions/{on}/sets", json=body)


def test_program(client) -> None:
    data = client.get("/api/program").json()
    assert data["version"] == "v9.1"
    assert [d["day"] for d in data["days"]] == ["Mon", "Wed", "Thu", "Sat", "Sun"]


def test_today_plan_order_and_details(client) -> None:
    data = plan(client)
    assert data["day"]["name"] == "Upper A" and data["session"] is None
    blocks = [s["block"] for s in data["slots"]]
    assert blocks[0] == "warmup" and blocks[-1] == "cooldown"
    assert blocks.index("forearm") > max(i for i, b in enumerate(blocks) if b == "core")
    c2 = next(s for s in data["slots"] if s["key"] == "C2")
    assert (c2["measure"], c2["per_side"], c2["target_text"]) == ("seconds", True, "30 s / side")
    assert [c["mode"] for c in data["cardio"]] == ["Air bike", "Incline walk"]
    either = next(s for s in data["slots"] if s["key"] == "3")
    assert either["alt_exercise_id"] in {int(k) for k in data["exercises"]}
    # Swaps for planned exercises are included so the swap sheet works offline.
    pulldown = data["exercises"][str(ex_id(data, "Demo Pulldown — wide grip"))]
    assert [s["rank"] for s in pulldown["swaps"]] == [1, 2]
    assert str(pulldown["swaps"][0]["id"]) in data["exercises"]


def test_wednesday_has_no_forearm(client) -> None:
    assert "forearm" not in [s["block"] for s in plan(client, WED)["slots"]]


def test_log_undo_and_idempotency(client) -> None:
    pulldown = ex_id(plan(client), "Demo Pulldown — wide grip")
    r = log(client, MON, "1", pulldown, 0, w=100, r=10)
    assert r.status_code == 201 and r.json()["is_pr"] is False  # first time: baseline
    assert log(client, MON, "1", pulldown, 0, w=100, r=10).status_code == 200  # retry
    assert log(client, MON, "1", pulldown, 0, w=90, r=8, cid="other").status_code == 409
    session = plan(client)["session"]
    assert session["slots"]["1"]["done_as"] == pulldown and len(session["sets"]) == 1
    assert client.delete(f"/api/sessions/{MON}/sets/{MON}/1/0").status_code == 204
    assert client.delete(f"/api/sessions/{MON}/sets/{MON}/1/0").status_code == 204
    session = plan(client)["session"]
    assert session["sets"] == [] and session["slots"]["1"]["done_as"] is None


def test_pr_then_last_values(client) -> None:
    pulldown = ex_id(plan(client), "Demo Pulldown — wide grip")
    assert log(client, MON, "1", pulldown, 0, w=100, r=10).json()["is_pr"] is False
    assert log(client, MON, "1", pulldown, 1, w=105, r=10).json()["is_pr"] is True
    nxt = MON + timedelta(days=7)
    data = plan(client, nxt)
    assert data["exercises"][str(pulldown)]["last"] == [
        {"w": 100, "r": 10, "s": None},
        {"w": 105, "r": 10, "s": None},
    ]


def test_assisted_pr_is_inverted(client) -> None:
    data = plan(client)
    pull = ex_id(data, "Assisted Demo Pull-Up")
    assert data["exercises"][str(pull)]["assisted"] is True
    assert log(client, MON, "2", pull, 0, w=50, r=8).json()["is_pr"] is False  # baseline
    assert log(client, MON, "2", pull, 1, w=55, r=8).json()["is_pr"] is False  # more help
    assert log(client, MON, "2", pull, 2, w=45, r=8).json()["is_pr"] is True  # less help
    nxt = MON + timedelta(days=7)
    assert log(client, nxt, "2", pull, 0, w=40, r=5).json()["is_pr"] is False  # under 6 reps


def test_timed_and_per_side(client) -> None:
    carry = ex_id(plan(client), "Demo Carry")
    assert log(client, MON, "C2", carry, 0, w=40, s=30).json()["is_pr"] is False
    assert log(client, MON, "C2", carry, 1, w=40, s=35).json()["is_pr"] is True
    assert log(client, MON, "C2", carry, 2, w=35, s=35).json()["is_pr"] is False


def test_checklist_items_are_not_set_logged(client) -> None:
    data = plan(client)
    warmup = next(s for s in data["slots"] if s["key"] == "WU")
    assert warmup["loggable"] is False
    assert log(client, MON, "WU", warmup["exercise_id"], 0, r=1).status_code == 422


def test_stop_event_blocks_pr(client) -> None:
    pulldown = ex_id(plan(client), "Demo Pulldown — wide grip")
    log(client, MON, "1", pulldown, 0, w=100, r=10)
    body = {"client_id": "stop-1", "slot_key": "1", "exercise_id": pulldown, "set_index": 1,
            "weight_lb": 100, "symptom": "Pinch", "note": "made-up"}  # fmt: skip
    r = client.post(f"/api/sessions/{MON}/stops", json=body)
    assert r.status_code == 201
    assert client.post(f"/api/sessions/{MON}/stops", json=body).status_code == 200
    session = plan(client)["session"]
    assert session["slots"]["1"]["status"] == "stopped" and len(session["stops"]) == 1
    # A set logged after the stop (same exercise, another slot) is never a PR.
    assert log(client, MON, "OPT1", pulldown, 0, w=200, r=10).json()["is_pr"] is False


def test_swap_and_later(client) -> None:
    data = plan(client)
    planned = next(s for s in data["slots"] if s["key"] == "1")
    sub = data["exercises"][str(planned["exercise_id"])]["swaps"][0]["id"]
    r = client.post(f"/api/sessions/{MON}/slots/1/swap", json={"exercise_id": sub})
    assert r.json()["slots"]["1"]["swapped_to"] == sub
    r = client.post(
        f"/api/sessions/{MON}/slots/1/swap", json={"exercise_id": planned["exercise_id"]}
    )
    assert r.json()["slots"]["1"]["swapped_to"] is None  # back to the plan
    r = client.post(f"/api/sessions/{MON}/slots/1/later")
    assert r.json()["order"][-1] == "1" and r.json()["slots"]["1"]["later"] is True
    assert client.post(f"/api/sessions/{MON}/slots/nope/later").status_code == 404


def test_put_session_state(client) -> None:
    data = plan(client)
    keys = [s["key"] for s in data["slots"]]
    order = list(reversed(keys))
    body = {"gear": {"Straps": True, "Unknown": True}, "finished": True, "order": order,
            "slots": {"1": {"status": "done"}, "2": {"status": "skipped"}}}  # fmt: skip
    r = client.put(f"/api/sessions/{MON}", json=body)
    assert r.status_code == 200
    s = r.json()
    assert s["order"] == order and s["finished"] is True
    assert s["gear"] == {"Bands": False, "Hip Halo": False, "Straps": True}
    assert s["slots"]["2"]["status"] == "skipped"
    bad = {"slots": {"1": {"status": "nonsense"}}}
    assert client.put(f"/api/sessions/{MON}", json=bad).status_code == 422


def test_notes(client) -> None:
    pulldown = ex_id(plan(client), "Demo Pulldown — wide grip")
    r = client.post("/api/notes", json={"kind": "cue", "text": "My cue", "exercise_id": pulldown})
    assert r.status_code == 201 and r.json()["source"] == "own"
    pinned = plan(client)["exercises"][str(pulldown)]["pinned"]
    assert pinned[0]["text"] == "My cue"  # own notes first
    session_note = {"kind": "session", "text": "Gym was busy", "date": MON.isoformat()}
    assert client.post("/api/notes", json=session_note).status_code == 201
    assert plan(client)["session"]["notes"][0]["text"] == "Gym was busy"
    assert client.post("/api/notes", json={"kind": "session", "text": "x"}).status_code == 422
    program_note = next(p for p in pinned if p["source"] == "program")
    assert client.delete(f"/api/notes/{program_note['id']}").status_code == 409
    assert client.delete(f"/api/notes/{r.json()['id']}").status_code == 204


def test_library_and_card(client) -> None:
    lib = client.get("/api/exercises").json()["exercises"]
    by_name = {e["name"]: e for e in lib}
    assert by_name["Demo Wrist Curl"]["days"] == ["Mon", "Thu"]
    assert by_name["Demo Shrug"]["excluded"]["kind"] == "goal"
    assert by_name["Demo Machine Pulldown"]["substitute"] is True
    assert "Demo Warm-up Circuit" not in by_name  # routines are not library entries
    squat = by_name["Demo Squat"]["id"]
    card = client.get(f"/api/exercises/{squat}").json()
    assert any(n["kind"] == "cap" and n["cap_lb"] == 100 for n in card["pinned"])
    assert card["plan"] == [
        {"day": "Wed", "code": "1", "sets_text": "3", "target_text": "6-8", "optional": False}
    ]
    assert set(card["related"]) == {str(sw["id"]) for sw in card["swaps"]} | {
        str(i) for i in card["same"]
    }
    assert client.get("/api/exercises/99999").status_code == 404


def test_pr_rules_unit() -> None:
    prior = [SetValue(100, 10)]
    assert is_pr(SetValue(100, 11), prior)
    assert not is_pr(SetValue(100, 10), prior)
    assert not is_pr(SetValue(100, 10), [])
    assert is_pr(SetValue(None, 12), [SetValue(None, 10)])
    assisted = [SetValue(50, 8)]
    assert is_pr(SetValue(50, 9), assisted, assisted=True)
    assert not is_pr(SetValue(50, 7), assisted, assisted=True)
    assert is_pr(SetValue(45, 6), assisted, assisted=True, rep_floor=6)
    assert not is_pr(SetValue(45, 5), assisted, assisted=True, rep_floor=6)


def test_dips_are_assisted_and_override_via_patch(client) -> None:
    data = plan(client)
    dips = ex_id(data, "Demo Dips")
    assert data["exercises"][str(dips)]["assisted"] is True
    assert log(client, MON, "OPT1", dips, 0, w=40, r=6).json()["is_pr"] is False
    assert log(client, MON, "OPT1", dips, 1, w=30, r=6).json()["is_pr"] is True  # less help
    r = client.patch(f"/api/exercises/{dips}", json={"assisted": False})
    assert r.json() == {"id": dips, "assisted": False, "assisted_override": False}
    assert plan(client)["exercises"][str(dips)]["assisted"] is False
    r = client.patch(f"/api/exercises/{dips}", json={"assisted": None})
    assert r.json()["assisted"] is True  # back to following the program
    assert client.patch(f"/api/exercises/{dips}", json={}).json()["assisted_override"] is None


# ---------------------------------------------------------------- never linear: no state locks


def stop_body(exercise, k, cid="2026-11-16/1", slot="1", symptom="Pinch"):
    return {"client_id": cid, "slot_key": slot, "exercise_id": exercise, "set_index": k,
            "weight_lb": 100, "symptom": symptom, "note": None}  # fmt: skip


def slot_status(client, key="1"):
    return plan(client)["session"]["slots"][key]["status"]


def test_any_state_can_log_and_logging_reopens(client) -> None:
    pulldown = ex_id(plan(client), "Demo Pulldown — wide grip")
    # Untouched -> in progress.
    assert log(client, MON, "1", pulldown, 0, w=100, r=10).status_code == 201
    assert slot_status(client) == "active"
    # Skipped (as Finish workout leaves it) -> logging reopens it.
    state = {"slots": {"1": {"status": "skipped", "done_as": pulldown}}}
    client.put(f"/api/sessions/{MON}", json=state)
    assert log(client, MON, "1", pulldown, 1, w=100, r=10).status_code == 201
    assert slot_status(client) == "active"
    # Stopped -> logging reopens it; the stop stays on record until undone.
    assert client.post(f"/api/sessions/{MON}/stops", json=stop_body(pulldown, 2)).status_code == 201
    assert slot_status(client) == "stopped"
    assert log(client, MON, "1", pulldown, 3, w=100, r=9).status_code == 201
    assert slot_status(client) == "active"
    assert len(plan(client)["session"]["stops"]) == 1
    # Done -> an extra set is accepted and the exercise stays Done.
    client.put(
        f"/api/sessions/{MON}", json={"slots": {"1": {"status": "done", "done_as": pulldown}}}
    )
    assert log(client, MON, "1", pulldown, 4, w=100, r=8).status_code == 201
    assert slot_status(client) == "done"


def test_undo_stop_removes_it_everywhere(client) -> None:
    from tests.test_progress import progress

    pulldown = ex_id(plan(client), "Demo Pulldown — wide grip")
    log(client, MON, "1", pulldown, 0, w=100, r=10)
    client.post(f"/api/sessions/{MON}/stops", json=stop_body(pulldown, 1))
    card = client.get(f"/api/exercises/{pulldown}").json()
    assert card["sessions"][-1]["stop"]["symptom"] == "Pinch"
    assert progress(client, WED)["calendar"]["2026-11-16"] == "stop"

    r = client.delete(f"/api/sessions/{MON}/stops/2026-11-16/1")
    assert r.status_code == 204
    session = plan(client)["session"]
    assert session["stops"] == [] and session["slots"]["1"]["status"] == "active"
    assert client.get(f"/api/exercises/{pulldown}").json()["sessions"][-1]["stop"] is None
    assert progress(client, WED)["calendar"]["2026-11-16"] == "partial"
    # A retry after it is gone is fine.
    assert client.delete(f"/api/sessions/{MON}/stops/2026-11-16/1").status_code == 204
    # Sets logged after the undo can be personal records again.
    assert log(client, MON, "1", pulldown, 1, w=120, r=10).json()["is_pr"] is True


def test_undo_stop_with_nothing_logged_goes_back_to_untouched(client) -> None:
    # Today's false stop: stopped on the first set, nothing logged.
    pulldown = ex_id(plan(client), "Demo Pulldown — wide grip")
    client.post(f"/api/sessions/{MON}/stops", json=stop_body(pulldown, 0, symptom="Other"))
    client.delete(f"/api/sessions/{MON}/stops/2026-11-16/1")
    slot = plan(client)["session"]["slots"]["1"]
    assert slot["status"] == "todo" and slot["done_as"] is None
    from tests.test_progress import progress

    assert progress(client, WED)["calendar"]["2026-11-16"] != "stop"


def test_stopping_again_replaces_the_stop(client) -> None:
    pulldown = ex_id(plan(client), "Demo Pulldown — wide grip")
    client.post(f"/api/sessions/{MON}/stops", json=stop_body(pulldown, 0))
    log(client, MON, "1", pulldown, 1, w=100, r=10)  # reopened
    r = client.post(f"/api/sessions/{MON}/stops", json=stop_body(pulldown, 2, symptom="Dull ache"))
    assert r.status_code == 200
    stops = plan(client)["session"]["stops"]
    assert len(stops) == 1 and stops[0]["set_index"] == 2 and stops[0]["symptom"] == "Dull ache"
    assert slot_status(client) == "stopped"
