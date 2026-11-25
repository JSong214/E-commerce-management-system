from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture
def mysql_url():
    from app.env import get_test_database_url

    server_url = get_test_database_url()
    if not server_url:
        pytest.skip("Set TEST_DATABASE_URL to a disposable MySQL 8.0 server")
    server = make_url(server_url)
    schema = f"sjh_test_{uuid4().hex}"
    admin = create_engine(
        server.set(database="information_schema"), hide_parameters=True
    )
    try:
        with admin.begin() as conn:
            conn.exec_driver_sql(
                f"CREATE DATABASE `{schema}` COLLATE utf8mb4_0900_ai_ci"
            )
        yield server.set(database=schema)
    finally:
        with admin.begin() as conn:
            conn.exec_driver_sql(f"DROP DATABASE IF EXISTS `{schema}`")
        admin.dispose()


@pytest.fixture
def migration(mysql_url):
    config = Config(str(BACKEND / "alembic.ini"))
    config.attributes["database_url"] = mysql_url
    return config


@pytest.fixture
def staging_dir(mysql_url, monkeypatch):
    directory = BACKEND / "tmp" / mysql_url.database
    monkeypatch.setenv("STAGING_DIR", str(directory))
    yield directory
    if directory.exists():
        for item in directory.iterdir():
            item.unlink()
        directory.rmdir()


@pytest.fixture
def client(mysql_url, migration, monkeypatch, staging_dir):
    from app.db import Database
    from app.main import create_app
    from app.seed import seed

    command.upgrade(migration, "head")
    monkeypatch.setenv("DATABASE_URL", mysql_url.render_as_string(hide_password=False))
    database = Database(mysql_url)
    try:
        seed(database)
    finally:
        database.close()
    with TestClient(create_app()) as session:
        yield session
