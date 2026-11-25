from sqlalchemy.engine import URL

from app.env import (
    get_cors_origins,
    get_database_url,
    get_test_database_url,
    load_env,
    parse_env_text,
)


def test_parse_env_text_handles_quotes_comments_and_export():
    parsed = parse_env_text(
        """
        # comment line
        MYSQL_USER=sjh # inline comment
        export MYSQL_PASSWORD='p@ss#word:123/456?x=1'
        DOUBLE_QUOTED="line1\\nline2\\"quoted\\""
        EMPTY_VAR=
        """
    )

    assert parsed["MYSQL_USER"] == "sjh"
    assert parsed["MYSQL_PASSWORD"] == "p@ss#word:123/456?x=1"
    assert parsed["DOUBLE_QUOTED"] == 'line1\nline2"quoted"'
    assert parsed["EMPTY_VAR"] == ""


def test_load_env_preserves_existing_process_env_and_skips_empty(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\ufeffMYSQL_USER=from_file\nMYSQL_PASSWORD=\nCORS_ORIGINS=http://localhost:5174\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("MYSQL_USER", "from_shell")
    monkeypatch.delenv("MYSQL_PASSWORD", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)

    load_env(env_file)

    assert "MYSQL_PASSWORD" not in __import__("os").environ
    assert __import__("os").environ["MYSQL_USER"] == "from_shell"
    assert get_cors_origins() == ["http://localhost:5174"]


def test_get_database_url_builds_encoded_url_from_mysql_vars(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "MYSQL_HOST=127.0.0.1\nMYSQL_PORT=3309\nMYSQL_DATABASE=sjh_local\n"
        "MYSQL_USER=analyst\nMYSQL_PASSWORD='s@ecret#/:?'\n",
        encoding="utf-8",
    )
    monkeypatch.setattr("app.env.DEFAULT_ENV_FILE", env_file)
    for key in (
        "DATABASE_URL",
        "MYSQL_HOST",
        "MYSQL_PORT",
        "MYSQL_DATABASE",
        "MYSQL_USER",
        "MYSQL_PASSWORD",
    ):
        monkeypatch.delenv(key, raising=False)

    url = get_database_url()
    assert isinstance(url, URL)
    assert url.username == "analyst"
    assert url.password == "s@ecret#/:?"
    assert url.host == "127.0.0.1"
    assert url.port == 3309
    assert url.database == "sjh_local"
    assert url.query == {"charset": "utf8mb4"}


def test_get_database_url_prefers_explicit_database_url(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("MYSQL_USER=sjh\nMYSQL_PASSWORD=file_pass\n", encoding="utf-8")
    monkeypatch.setattr("app.env.DEFAULT_ENV_FILE", env_file)
    monkeypatch.setenv(
        "DATABASE_URL", "mysql+pymysql://override:pass@127.0.0.1:3307/override_db"
    )

    assert (
        get_database_url()
        == "mysql+pymysql://override:pass@127.0.0.1:3307/override_db"
    )


def test_get_database_url_returns_none_when_password_blank(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("MYSQL_USER=sjh\nMYSQL_PASSWORD=\n", encoding="utf-8")
    monkeypatch.setattr("app.env.DEFAULT_ENV_FILE", env_file)
    for key in ("DATABASE_URL", "MYSQL_USER", "MYSQL_PASSWORD"):
        monkeypatch.delenv(key, raising=False)

    assert get_database_url() is None


def test_get_test_database_url_returns_none_when_unset(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("TEST_MYSQL_USER=root\nTEST_MYSQL_PASSWORD=\n", encoding="utf-8")
    monkeypatch.setattr("app.env.DEFAULT_ENV_FILE", env_file)
    for key in ("TEST_DATABASE_URL", "TEST_MYSQL_USER", "TEST_MYSQL_PASSWORD"):
        monkeypatch.delenv(key, raising=False)

    assert get_test_database_url() is None
