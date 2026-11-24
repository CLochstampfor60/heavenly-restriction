"""Account settings: shared by every signed-in device."""


def put(client, **body) -> dict:
    return client.put("/api/settings", json=body).json()


def test_rest_timer_defaults(client) -> None:
    r = client.get("/api/settings")
    assert r.status_code == 200
    assert r.json() == {"rest_timer_mode": "set", "rest_default_s": 90, "rest_timer": True}


def test_each_rest_mode_round_trips(client) -> None:
    for mode in ("off", "exercise", "set"):
        assert (
            client.put("/api/settings", json={"rest_timer_mode": mode}).json()["rest_timer_mode"]
            == mode
        )
        got = client.get("/api/settings").json()
        assert got["rest_timer_mode"] == mode and got["rest_timer"] is (mode != "off")
    assert (
        client.put("/api/settings", json={}).json()["rest_timer_mode"] == "set"
    )  # left out: unchanged


def test_default_rest_in_15_s_steps(client) -> None:
    assert client.put("/api/settings", json={"rest_default_s": 120}).json()["rest_default_s"] == 120
    for bad in (100, 0, 615, "long"):
        assert client.put("/api/settings", json={"rest_default_s": bad}).status_code == 422
    assert client.get("/api/settings").json()["rest_default_s"] == 120


def test_rejects_unknown_modes(client) -> None:
    assert client.put("/api/settings", json={"rest_timer_mode": "sometimes"}).status_code == 422
    assert client.put("/api/settings", json={"rest_timer": "sometimes"}).status_code == 422


def test_older_app_on_off_flag_still_works(client) -> None:
    # An app copy cached on the phone before the update sends only rest_timer.
    assert (
        client.put("/api/settings", json={"rest_timer": False}).json()["rest_timer_mode"] == "off"
    )
    assert put(client, rest_timer=True)["rest_timer_mode"] == "set"
    client.put("/api/settings", json={"rest_timer_mode": "exercise"})
    # "On" from an old copy keeps a mode already chosen.
    assert (
        client.put("/api/settings", json={"rest_timer": True}).json()["rest_timer_mode"]
        == "exercise"
    )


def test_settings_need_a_session(anon) -> None:
    assert anon.get("/api/settings").status_code == 401
    assert anon.put("/api/settings", json={"rest_timer_mode": "off"}).status_code == 401
