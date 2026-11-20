"""Body metrics: one entry per day, bodyweight (lb) and waist (in), each optional."""

from tests.test_api import MON


def test_put_get_edit_and_clear(client) -> None:
    r = client.put(f"/api/body-metrics/{MON}", json={"bodyweight_lb": 190.4, "waist_in": 36.5})
    assert r.json() == {"date": str(MON), "bodyweight_lb": 190.4, "waist_in": 36.5}
    # Leaving a field out keeps it; null removes just that measurement.
    r = client.put(f"/api/body-metrics/{MON}", json={"bodyweight_lb": 189.8})
    assert r.json()["waist_in"] == 36.5 and r.json()["bodyweight_lb"] == 189.8
    r = client.put(f"/api/body-metrics/{MON}", json={"waist_in": None})
    assert r.json()["waist_in"] is None
    entries = client.get("/api/body-metrics").json()["entries"]
    assert entries == [{"date": str(MON), "bodyweight_lb": 189.8, "waist_in": None}]


def test_range_and_delete(client) -> None:
    client.put("/api/body-metrics/2026-10-01", json={"bodyweight_lb": 195})
    client.put(f"/api/body-metrics/{MON}", json={"bodyweight_lb": 190})
    got = client.get("/api/body-metrics", params={"start": "2026-11-01"}).json()["entries"]
    assert [e["date"] for e in got] == [str(MON)]
    assert client.delete(f"/api/body-metrics/{MON}").status_code == 204
    assert client.delete(f"/api/body-metrics/{MON}").status_code == 204  # retry-safe
    assert [e["date"] for e in client.get("/api/body-metrics").json()["entries"]] == ["2026-10-01"]


def test_validation(client) -> None:
    assert client.put(f"/api/body-metrics/{MON}", json={"bodyweight_lb": -5}).status_code == 422
    assert client.put(f"/api/body-metrics/{MON}", json={"waist_in": 0}).status_code == 422
    assert client.put("/api/body-metrics/not-a-date", json={}).status_code == 422


def test_progress_returns_entries(client) -> None:
    client.put(f"/api/body-metrics/{MON}", json={"bodyweight_lb": 190, "waist_in": 36})
    p = client.get("/api/progress", params={"date": str(MON)}).json()
    assert p["body_entries"] == [{"date": str(MON), "bodyweight_lb": 190, "waist_in": 36}]
