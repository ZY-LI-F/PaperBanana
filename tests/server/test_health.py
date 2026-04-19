"""Tests for GET /api/health."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.main import app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def test_health_returns_200(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200


def test_health_body_shape(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body["ok"] is True
    assert isinstance(body["version"], str)
    assert len(body["version"]) > 0


def test_health_version_matches_settings(client: TestClient) -> None:
    from server.settings import VERSION

    body = client.get("/api/health").json()
    assert body["version"] == VERSION
