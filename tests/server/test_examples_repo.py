from __future__ import annotations

from contextlib import closing

import pytest

from server.db import connect, init_db
from server.repos import examples_repo
from server.seeds.examples_seed import SEED_MARKER_KEY, seed_if_empty, seed_once


BASE_ROW = {
    "discipline": "Discovery",
    "title_en": "Shared crispr example",
    "title_zh": "共享 crispr 示例",
    "method_content_en": "crispr token method",
    "method_content_zh": "crispr 词条 方法",
    "caption_en": "crispr token caption",
    "caption_zh": "crispr 词条 说明",
}
SEEDED_ROW_ID = "target-crispr-multiomics"


def test_table_created_on_init(isolated_results) -> None:
    del isolated_results
    init_db()

    with closing(connect()) as connection:
        rows = connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('examples', '_meta')"
        ).fetchall()

    assert {row["name"] for row in rows} == {"examples", "_meta"}


def test_seed_idempotent(isolated_results) -> None:
    del isolated_results
    init_db()

    with closing(connect()) as connection, connection:
        first = seed_if_empty(connection)
        second = seed_if_empty(connection)
        count = connection.execute("SELECT COUNT(*) AS count FROM examples").fetchone()["count"]

    assert first == 6
    assert second == 0
    assert count == 6


def test_seed_marker_is_recorded(isolated_results) -> None:
    del isolated_results
    init_db()

    with closing(connect()) as connection, connection:
        inserted = seed_once(connection)
        marker = connection.execute(
            "SELECT key, value, set_at FROM _meta WHERE key = ?",
            (SEED_MARKER_KEY,),
        ).fetchone()

    assert inserted == 6
    assert marker is not None
    assert marker["key"] == SEED_MARKER_KEY
    assert marker["value"] == marker["set_at"]


def test_insert_get_update_delete_roundtrip(isolated_results) -> None:
    del isolated_results
    init_db()

    with closing(connect()) as connection, connection:
        created = examples_repo.create_example(connection, {**BASE_ROW, "priority": 2})
        fetched = examples_repo.get_example(connection, created["id"])
        updated = examples_repo.update_example(
            connection,
            created["id"],
            {"priority": 3, "title_en": "Updated title"},
        )
        deleted = examples_repo.delete_example(connection, created["id"])
        missing = examples_repo.get_example(connection, created["id"])

    assert fetched is not None
    assert fetched["title_en"] == BASE_ROW["title_en"]
    assert updated is not None
    assert updated["priority"] == 3
    assert updated["title_en"] == "Updated title"
    assert deleted is True
    assert missing is None


def test_priority_validated(isolated_results) -> None:
    del isolated_results
    init_db()

    with closing(connect()) as connection, connection:
        with pytest.raises(ValueError, match="priority must be one of 1, 2, 3"):
            examples_repo.create_example(connection, {**BASE_ROW, "priority": 0})
        with pytest.raises(ValueError, match="priority must be one of 1, 2, 3"):
            examples_repo.create_example(connection, {**BASE_ROW, "priority": 4})
        created = examples_repo.create_example(connection, {**BASE_ROW, "priority": 2})
        with pytest.raises(ValueError, match="priority must be one of 1, 2, 3"):
            examples_repo.update_example(connection, created["id"], {"priority": 5})


def test_list_sorted_by_priority_desc(isolated_results) -> None:
    del isolated_results
    init_db()

    with closing(connect()) as connection, connection:
        low = examples_repo.create_example(connection, {**BASE_ROW, "title_en": "Low", "title_zh": "低", "priority": 1})
        high = examples_repo.create_example(
            connection,
            {**BASE_ROW, "title_en": "High", "title_zh": "高", "priority": 3},
        )
        rows = examples_repo.list_examples(connection)

    assert [rows[0]["id"], rows[1]["id"]] == [high["id"], low["id"]]


def test_search_priority_weighting(isolated_results) -> None:
    del isolated_results
    init_db()

    with closing(connect()) as connection, connection:
        medium = examples_repo.create_example(
            connection,
            {**BASE_ROW, "title_en": "Medium crispr", "title_zh": "中 crispr", "priority": 2},
        )
        high = examples_repo.create_example(
            connection,
            {**BASE_ROW, "title_en": "High crispr", "title_zh": "高 crispr", "priority": 3},
        )
        hits = examples_repo.search_examples(connection, "crispr", top_k=2)

    assert [hits[0]["id"], hits[1]["id"]] == [high["id"], medium["id"]]
    assert hits[0]["score"] > hits[1]["score"]


def test_search_empty_query_returns_default_order(isolated_results) -> None:
    del isolated_results
    init_db()

    with closing(connect()) as connection, connection:
        low = examples_repo.create_example(connection, {**BASE_ROW, "title_en": "Low", "title_zh": "低", "priority": 1})
        high = examples_repo.create_example(
            connection,
            {**BASE_ROW, "title_en": "High", "title_zh": "高", "priority": 3},
        )
        hits = examples_repo.search_examples(connection, "", top_k=2)

    assert [hits[0]["id"], hits[1]["id"]] == [high["id"], low["id"]]
    assert hits[0]["score"] == 0.0
    assert hits[1]["score"] == 0.0


def test_update_rejects_empty_required_field(isolated_results) -> None:
    del isolated_results
    init_db()

    with closing(connect()) as connection, connection:
        row = examples_repo.create_example(connection, BASE_ROW)
        with pytest.raises(ValueError):
            examples_repo.update_example(connection, row["id"], {"title_en": ""})


def test_update_rejects_null_required_field(isolated_results) -> None:
    del isolated_results
    init_db()

    with closing(connect()) as connection, connection:
        row = examples_repo.create_example(connection, BASE_ROW)
        with pytest.raises(ValueError):
            examples_repo.update_example(connection, row["id"], {"title_en": None})


def test_seed_if_empty_is_race_safe(isolated_results) -> None:
    """With INSERT OR IGNORE, two back-to-back calls on a fresh DB must not collide."""
    del isolated_results
    init_db()

    with closing(connect()) as connection, connection:
        first = seed_if_empty(connection)
        second = seed_if_empty(connection)
        third = seed_if_empty(connection)
        count = connection.execute("SELECT COUNT(*) AS count FROM examples").fetchone()["count"]

    assert first == 6
    assert second == 0
    assert third == 0
    assert count == 6


def test_deleted_seeded_row_stays_deleted_after_reseed(isolated_results) -> None:
    del isolated_results
    init_db()

    with closing(connect()) as connection, connection:
        first = seed_once(connection)
        deleted = examples_repo.delete_example(connection, SEEDED_ROW_ID)
        second = seed_once(connection)
        count = connection.execute("SELECT COUNT(*) AS count FROM examples").fetchone()["count"]
        row = examples_repo.get_example(connection, SEEDED_ROW_ID)

    assert first == 6
    assert deleted is True
    assert second == 0
    assert count == 5
    assert row is None


def test_seed_marker_prevents_reseed_on_truly_empty_table(isolated_results) -> None:
    del isolated_results
    init_db()

    with closing(connect()) as connection, connection:
        first = seed_once(connection)
        connection.execute("DELETE FROM examples")
        second = seed_once(connection)
        count = connection.execute("SELECT COUNT(*) AS count FROM examples").fetchone()["count"]

    assert first == 6
    assert second == 0
    assert count == 0


def test_update_partial_non_required_field_ok(isolated_results) -> None:
    del isolated_results
    init_db()

    with closing(connect()) as connection, connection:
        row = examples_repo.create_example(connection, BASE_ROW)
        updated = examples_repo.update_example(
            connection, row["id"], {"suggested_aspect_ratio": "16:9"}
        )

    assert updated is not None
    assert updated["suggested_aspect_ratio"] == "16:9"
    assert updated["title_en"] == BASE_ROW["title_en"]
