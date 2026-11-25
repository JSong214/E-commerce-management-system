import os
import re
from pathlib import Path

from sqlalchemy.engine import URL

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_ENV_FILE = BACKEND_DIR / ".env"

_INLINE_COMMENT_RE = re.compile(r"\s+#.*$")
_DOUBLE_QUOTE_ESCAPES = {
    "n": "\n",
    "r": "\r",
    "t": "\t",
    '"': '"',
    "\\": "\\",
}


def _unescape_double_quoted(raw: str) -> str:
    result: list[str] = []
    index = 0
    length = len(raw)
    while index < length:
        char = raw[index]
        if char == "\\" and index + 1 < length:
            nxt = raw[index + 1]
            if nxt in _DOUBLE_QUOTE_ESCAPES:
                result.append(_DOUBLE_QUOTE_ESCAPES[nxt])
                index += 2
                continue
        result.append(char)
        index += 1
    return "".join(result)


def parse_env_text(content: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        if "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        value = raw_value.strip()
        if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
            parsed = _unescape_double_quoted(value[1:-1])
        elif len(value) >= 2 and value[0] == "'" and value[-1] == "'":
            parsed = value[1:-1]
        else:
            parsed = _INLINE_COMMENT_RE.sub("", value).strip()
        values[key] = parsed
    return values


def load_env(env_path: Path | None = None, *, override: bool = False) -> dict[str, str]:
    path = env_path or DEFAULT_ENV_FILE
    if not path.is_file():
        return {}
    parsed = parse_env_text(path.read_text(encoding="utf-8-sig"))
    for key, value in parsed.items():
        if value == "":
            continue
        if override or key not in os.environ:
            os.environ[key] = value
    return parsed


def build_mysql_url(
    *,
    prefix: str = "MYSQL_",
    default_port: int = 3307,
    include_database: bool = True,
) -> URL | None:
    user = os.getenv(f"{prefix}USER", "").strip()
    password = os.getenv(f"{prefix}PASSWORD", "")
    if not user or not password:
        return None

    host = os.getenv(f"{prefix}HOST", "").strip() or "127.0.0.1"
    raw_port = os.getenv(f"{prefix}PORT", "").strip()
    port = int(raw_port) if raw_port else default_port
    database = (
        os.getenv(f"{prefix}DATABASE", "").strip() or "sjh_data"
        if include_database
        else None
    )
    return URL.create(
        drivername="mysql+pymysql",
        username=user,
        password=password,
        host=host,
        port=port,
        database=database,
        query={"charset": "utf8mb4"},
    )


def get_database_url() -> str | URL | None:
    load_env()
    explicit = os.getenv("DATABASE_URL", "").strip()
    if explicit:
        return explicit
    return build_mysql_url(prefix="MYSQL_", default_port=3307, include_database=True)


def get_test_database_url() -> str | URL | None:
    load_env()
    explicit = os.getenv("TEST_DATABASE_URL", "").strip()
    if explicit:
        return explicit
    return build_mysql_url(
        prefix="TEST_MYSQL_", default_port=3308, include_database=False
    )


def get_cors_origins() -> list[str]:
    load_env()
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if not raw:
        return ["http://localhost:5173"]
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins or ["http://localhost:5173"]
