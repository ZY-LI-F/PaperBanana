from __future__ import annotations

import sqlite3
from pathlib import Path

import server.settings as settings


_DDL_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        exp_mode TEXT NOT NULL,
        retrieval_setting TEXT NOT NULL,
        num_candidates INTEGER NOT NULL,
        aspect_ratio TEXT,
        figure_size TEXT,
        figure_language TEXT,
        max_critic_rounds INTEGER,
        main_model TEXT NOT NULL,
        image_model TEXT NOT NULL,
        method_content TEXT NOT NULL,
        caption TEXT NOT NULL,
        planner_prompt TEXT,
        visualizer_prompt TEXT,
        final_image_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        last_stage TEXT,
        error TEXT,
        parent_run_id TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS run_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        stage_name TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        payload_path TEXT,
        image_paths TEXT,
        error TEXT,
        UNIQUE(run_id, stage_name)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS battle_runs (
        id TEXT PRIMARY KEY,
        parent_run_id TEXT REFERENCES runs(id),
        image_model TEXT NOT NULL,
        status TEXT NOT NULL,
        final_image_path TEXT,
        error TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS examples (
        id TEXT PRIMARY KEY,
        discipline TEXT NOT NULL,
        title_en TEXT NOT NULL,
        title_zh TEXT NOT NULL,
        method_content_en TEXT NOT NULL,
        method_content_zh TEXT NOT NULL,
        caption_en TEXT NOT NULL,
        caption_zh TEXT NOT NULL,
        suggested_aspect_ratio TEXT,
        image_path TEXT,
        priority INTEGER NOT NULL DEFAULT 2,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (priority IN (1,2,3))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS _meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        set_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_run_stages_run_id ON run_stages(run_id)",
    "CREATE INDEX IF NOT EXISTS idx_examples_priority_created ON examples(priority DESC, created_at DESC)",
)


def connect() -> sqlite3.Connection:
    db_path = _db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(str(db_path))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    connection = connect()
    try:
        with connection:
            for statement in _DDL_STATEMENTS:
                connection.execute(statement)
    finally:
        connection.close()


def _db_path() -> Path:
    configured = getattr(settings, "db_path", None)
    if callable(configured):
        configured = configured()
    if configured is None:
        configured = settings.DB_PATH
    return Path(configured)
