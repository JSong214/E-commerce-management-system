from pathlib import PureWindowsPath
from typing import Annotated

from fastapi import APIRouter, File, Form, UploadFile
from sqlalchemy import select

from .batch_writes import CommitRequest, commit_validated_import
from .db import Db
from .errors import ApiError
from .import_parser import parse_upload
from .import_validation import (
    ValidationRequest,
    prepare_validation,
    validation_settings,
)
from .spreadsheets import error_workbook
from .staging import Staging

router = APIRouter(prefix="/imports", tags=["Imports"])
PREVIEW_ROWS = 10


def selected_sheet(upload, requested):
    name = requested or upload["selected_sheet"]
    if name not in upload["sheets"]:
        raise ApiError(422, "SHEET_NOT_FOUND", "上传文件中没有指定的工作表")
    return name, upload["sheets"][name]


@router.post("/parse-preview")
def parse_preview(
    file: Annotated[UploadFile, File()],
    db: Db,
    staging: Staging,
    sheet_name: Annotated[str | None, Form()] = None,
):
    try:
        file_name = PureWindowsPath(file.filename or "").name
        if not file_name or len(file_name) > 255:
            raise ApiError(422, "INVALID_FILE_NAME", "文件名为空或超过 255 个字符")
        templates = db.tables["mapping_templates"]
        with db.engine.connect() as conn:
            presets = (
                conn.execute(select(templates).order_by(templates.c.id))
                .mappings()
                .all()
            )
        encoding, sheets = parse_upload(file.file, file_name, presets)
    finally:
        file.file.close()

    if not sheets:
        raise ApiError(422, "INVALID_FILE", "文件没有可读取的工作表")
    upload = {
        "file_name": file_name,
        "file_encoding": encoding,
        "sheets": sheets,
        "selected_sheet": next(iter(sheets)),
    }
    name, sheet = selected_sheet(upload, sheet_name)
    upload["selected_sheet"] = name
    token = staging.save("stg", upload)
    return {
        "staged_file_id": token,
        "file_name": file_name,
        "file_encoding": encoding,
        "sheets": list(sheets),
        "selected_sheet": name,
        "total_rows": len(sheet["rows"]),
        "headers": sheet["headers"],
        "sample_rows": [row["values"] for row in sheet["rows"][:PREVIEW_ROWS]],
        "matched_template": sheet["matched_template"],
        "pii_columns_detected": sheet["pii_columns_detected"],
    }


@router.post("/validate")
def validate_import(body: ValidationRequest, db: Db, staging: Staging):
    upload = staging.load("stg", body.staged_file_id)
    name, sheet = selected_sheet(upload, body.sheet_name)
    with db.engine.connect() as conn:
        settings = validation_settings(conn, db, body, sheet)
        result = prepare_validation(conn, db, sheet, settings)
    token = staging.save(
        "val",
        {
            "staged_file_id": body.staged_file_id,
            "file_name": upload["file_name"],
            "file_encoding": upload["file_encoding"],
            "sheet_name": name,
            "settings": settings,
            **result,
        },
    )
    return {
        "validation_id": token,
        "summary": result["summary"],
        "unknown_shops": result["unknown_shops"],
        "unknown_statuses": result["unknown_statuses"],
        "errors_preview": [
            {key: value for key, value in error.items() if key != "raw_row_sanitized"}
            for error in result["errors"][:PREVIEW_ROWS]
        ],
        "warnings_preview": result["warnings"][:PREVIEW_ROWS],
        "cleaned_sample_rows": result["lines"][:PREVIEW_ROWS],
    }


@router.get("/validations/{validation_id}/errors/export")
def export_validation_errors(validation_id: str, staging: Staging):
    validation = staging.load("val", validation_id)
    return error_workbook(validation["errors"])


@router.post("/commit", status_code=201)
def commit_import(body: CommitRequest, db: Db, staging: Staging):
    return commit_validated_import(db, staging, body)
