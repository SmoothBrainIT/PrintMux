from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.octoprint_compat.router import router as octoprint_router
from .api.jobs.router import router as jobs_router
from .api.printers.router import router as printers_router
from .api.moonraker.router import router as moonraker_router
from .api.settings.router import router as settings_router
from .core.config import settings, ensure_storage_dir


def create_app() -> FastAPI:
    ensure_storage_dir()
    # Tables are managed via Alembic migrations.

    app = FastAPI(title=settings.app_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.cors_origins] if settings.cors_origins else ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(octoprint_router)
    app.include_router(jobs_router)
    app.include_router(printers_router)
    app.include_router(moonraker_router)
    app.include_router(settings_router)

    return app


app = create_app()
