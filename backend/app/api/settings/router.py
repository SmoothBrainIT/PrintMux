from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security import get_or_create_api_key, set_api_key

router = APIRouter(prefix="/api/settings", tags=["settings"])


class ApiKeyOut(BaseModel):
    api_key: str


@router.get("/api-key", response_model=ApiKeyOut)
def get_api_key(db: Session = Depends(get_db)) -> ApiKeyOut:
    return ApiKeyOut(api_key=get_or_create_api_key(db))


@router.post("/api-key/rotate", response_model=ApiKeyOut)
def rotate_api_key(db: Session = Depends(get_db)) -> ApiKeyOut:
    new_key = secrets.token_urlsafe(32)
    return ApiKeyOut(api_key=set_api_key(db, new_key))
