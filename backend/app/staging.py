import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, Request

from .env import load_env
from .errors import ApiError
from .time_values import LOCAL_TIMEZONE


class StagingStore:
    def __init__(self, directory: Path):
        self.directory = directory

    def save(self, prefix, payload):
        nonce = uuid4().hex
        if prefix == "val":
            # The validation token also gives commit a stable, date-prefixed batch number.
            nonce = f"{datetime.now(LOCAL_TIMEZONE):%Y%m%d}{nonce[:24]}"
        token = f"{prefix}_{nonce}"
        # On Windows the staging directory inherits the application's directory ACL.
        self.directory.mkdir(
            parents=True, exist_ok=True, mode=0o777 if os.name == "nt" else 0o700
        )
        path = self.directory / f"{token}.json"
        temporary = path.with_suffix(".tmp")
        try:
            with temporary.open("x", encoding="utf-8") as output:
                json.dump(payload, output, ensure_ascii=False, separators=(",", ":"))
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
        return token

    def path(self, prefix, token):
        if re.fullmatch(rf"{prefix}_[0-9a-f]{{32}}", token):
            return self.directory / f"{token}.json"
        raise ApiError(404, "STAGED_DATA_NOT_FOUND", "暂存数据已不存在，请重新上传文件")

    def load(self, prefix, token, *, optional=False):
        try:
            with self.path(prefix, token).open(encoding="utf-8") as source:
                return json.load(source)
        except FileNotFoundError as exc:
            if optional:
                return None
            raise ApiError(
                404, "STAGED_DATA_NOT_FOUND", "暂存数据已不存在，请重新上传文件"
            ) from exc

    def remove(self, prefix, token):
        self.path(prefix, token).unlink(missing_ok=True)


def get_staging(request: Request) -> StagingStore:
    return request.app.state.staging


def configured_staging() -> StagingStore:
    load_env()
    default_directory = Path(__file__).resolve().parents[1] / "storage" / "staging"
    return StagingStore(Path(os.getenv("STAGING_DIR") or str(default_directory)))


Staging = Annotated[StagingStore, Depends(get_staging)]
