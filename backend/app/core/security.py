from __future__ import annotations

import secrets

from fastapi import Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from ..models import AppSetting


def _get_setting(db: Session, key: str) -> AppSetting | None:
    return db.query(AppSetting).filter(AppSetting.key == key).first()


def get_or_create_api_key(db: Session) -> str:
    setting = _get_setting(db, "api_key")
    if setting:
        return setting.value

    api_key = settings.api_key or secrets.token_urlsafe(32)
    setting = AppSetting(key="api_key", value=api_key)
    db.add(setting)
    db.commit()
    return api_key


def set_api_key(db: Session, api_key: str) -> str:
    setting = _get_setting(db, "api_key")
    if setting:
        setting.value = api_key
    else:
        setting = AppSetting(key="api_key", value=api_key)
        db.add(setting)
    db.commit()
    return api_key


def require_api_key(
    x_api_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> str:
    current_key = get_or_create_api_key(db)
    if not x_api_key or x_api_key != current_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    return x_api_key


def optional_api_key(
    x_api_key: str | None = Header(default=None),
    api_key: str | None = Query(default=None, alias="api_key"),
    apikey: str | None = Query(default=None, alias="apikey"),
    db: Session = Depends(get_db),
) -> str | None:
    provided = x_api_key or api_key or apikey
    current_key = get_or_create_api_key(db)
    if provided and provided != current_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    return provided
