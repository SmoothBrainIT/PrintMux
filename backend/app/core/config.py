from __future__ import annotations

from pathlib import Path
from pydantic import BaseSettings


class Settings(BaseSettings):
    app_name: str = "PrintMux"
    api_key: str = "changeme"
    database_url: str = "sqlite:///./printmux.db"
    storage_dir: str = "./storage"
    cors_origins: str = "*"
    octoprint_timeout_seconds: int = 60

    class Config:
        env_prefix = "PRINTMUX_"
        env_file = ".env"


settings = Settings()


def ensure_storage_dir() -> Path:
    storage_path = Path(settings.storage_dir).resolve()
    storage_path.mkdir(parents=True, exist_ok=True)
    return storage_path
