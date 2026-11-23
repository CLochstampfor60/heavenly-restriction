"""Account settings: shared by every signed-in device."""


def test_rest_timer_defaults_on(client) -> None:
    r = client.get("/api/settings")
    assert r.status_code == 200 and r.json() == {"rest_timer": True}


def test_rest_timer_off_and_on(client) -> None:
    assert client.put("/api/settings", json={"rest_timer": False}).json()["rest_timer"] is False
    assert client.get("/api/settings").json()["rest_timer"] is False
    assert client.put("/api/settings", json={}).json()["rest_timer"] is False  # left out: unchanged
    assert client.put("/api/settings", json={"rest_timer": True}).json()["rest_timer"] is True
    assert client.get("/api/settings").json()["rest_timer"] is True


def test_rest_timer_rejects_non_booleans(client) -> None:
    assert client.put("/api/settings", json={"rest_timer": "sometimes"}).status_code == 422


def test_settings_need_a_session(anon) -> None:
    assert anon.get("/api/settings").status_code == 401
    assert anon.put("/api/settings", json={"rest_timer": False}).status_code == 401
