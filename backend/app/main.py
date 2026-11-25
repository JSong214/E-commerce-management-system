from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import batches, configurations, imports, order_queries, reports
from .db import Database
from .env import get_cors_origins, get_database_url
from .errors import register_errors
from .staging import configured_staging


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(application):
        try:
            yield
        finally:
            application.state.database.close()

    application = FastAPI(title="SJH-DATA", lifespan=lifespan)
    application.state.database = Database(get_database_url())
    application.state.staging = configured_staging()
    register_errors(application)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=get_cors_origins(),
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    @application.get("/api/v1/health")
    def health():
        return {"status": "ok"}

    application.include_router(configurations.router, prefix="/api/v1")
    application.include_router(imports.router, prefix="/api/v1")
    application.include_router(batches.router, prefix="/api/v1")
    application.include_router(order_queries.router, prefix="/api/v1")
    application.include_router(reports.router, prefix="/api/v1")
    return application


app = create_app()
