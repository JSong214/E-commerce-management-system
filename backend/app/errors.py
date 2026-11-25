import logging

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException


class ApiError(Exception):
    def __init__(
        self, status: int, code: str, message: str, details: dict | None = None
    ):
        super().__init__(message)
        self.status = status
        self.code = code
        self.details = details or {}


def error_response(status, code, message, details=None, headers=None):
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": details or {}}},
        headers=headers,
    )


def register_errors(application: FastAPI):
    @application.exception_handler(ApiError)
    async def api_error(request, exc):
        return error_response(exc.status, exc.code, str(exc), exc.details)

    @application.exception_handler(HTTPException)
    async def http_error(request, exc):
        code = "NOT_FOUND" if exc.status_code == 404 else f"HTTP_{exc.status_code}"
        return error_response(
            exc.status_code, code, str(exc.detail), headers=exc.headers
        )

    @application.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        issues = [
            {"location": list(issue["loc"]), "code": issue["type"]}
            for issue in exc.errors()
        ]
        return error_response(
            422, "VALIDATION_ERROR", "请求参数无效", {"issues": issues}
        )

    @application.middleware("http")
    async def internal_error(request, call_next):
        try:
            return await call_next(request)
        except Exception:
            logging.getLogger(__name__).exception("Unhandled API error")
            return error_response(500, "INTERNAL_ERROR", "服务器处理请求时出错")
