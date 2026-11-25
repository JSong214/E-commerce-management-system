from fastapi.testclient import TestClient


def test_health_is_available_to_the_local_dev_server():
    from app.main import app

    response = TestClient(app).get(
        "/api/v1/health", headers={"Origin": "http://localhost:5173"}
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_missing_route_uses_error_envelope():
    from app.main import app

    response = TestClient(app).get("/api/v1/unknown")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "NOT_FOUND", "message": "Not Found", "details": {}}
    }
