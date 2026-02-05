from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File as UploadFileParam, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security import optional_api_key
from ...core.storage import save_upload
from ...models import File as FileModel
from ...models import Job

router = APIRouter(tags=["moonraker"])


def _utc_timestamp(dt_value: datetime) -> float:
    return dt_value.replace(tzinfo=timezone.utc).timestamp()


@router.get("/server/info")
def server_info(_: str | None = Depends(optional_api_key)) -> dict[str, Any]:
    return {
        "result": {
            "klippy_connected": True,
            "klippy_state": "ready",
            "components": ["file_manager"],
            "failed_components": [],
            "registered_directories": ["gcodes"],
            "warnings": [],
            "websocket_count": 0,
            "moonraker_version": "v0.8.0-virtual",
            "api_version": [1, 0, 0],
            "api_version_string": "1.0.0",
        }
    }


@router.get("/printer/info")
def printer_info(_: str | None = Depends(optional_api_key)) -> dict[str, Any]:
    return {
        "result": {
            "state": "ready",
            "state_message": "Printer is ready",
        }
    }


@router.get("/printer/objects/list")
def printer_objects_list(_: str | None = Depends(optional_api_key)) -> dict[str, Any]:
    return {
        "result": {
            "objects": [
                "webhooks",
                "print_stats",
                "virtual_sdcard",
            ]
        }
    }


@router.get("/printer/objects/query")
def printer_objects_query(_: str | None = Depends(optional_api_key)) -> dict[str, Any]:
    return {
        "result": {
            "status": {
                "webhooks": {"state": "ready", "message": "Printer is ready"},
                "print_stats": {"state": "standby", "message": ""},
                "virtual_sdcard": {"progress": 0.0, "file_path": None},
            }
        }
    }


@router.get("/server/files/roots")
def file_roots(_: str | None = Depends(optional_api_key)) -> dict[str, Any]:
    return {
        "result": {
            "gcodes": {
                "name": "gcodes",
                "path": "",
                "permissions": "rw",
            }
        }
    }


@router.get("/server/files/list")
def file_list(
    root: str = "gcodes",
    _: str | None = Depends(optional_api_key),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if root != "gcodes":
        return {"result": []}

    files = db.query(FileModel).order_by(FileModel.uploaded_at.desc()).all()
    return {
        "result": [
            {
                "path": file.original_filename,
                "root": "gcodes",
                "size": file.size,
                "modified": _utc_timestamp(file.uploaded_at),
                "permissions": "rw",
            }
            for file in files
        ]
    }


@router.post("/server/files/upload", status_code=status.HTTP_201_CREATED)
def upload_file(
    file: UploadFile = UploadFileParam(...),
    root: str = Form(default="gcodes"),
    path: str | None = Form(default=None),
    print_start: str | None = Form(default=None),
    print_flag: str | None = Form(default=None, alias="print"),
    checksum: str | None = Form(default=None),
    _: str | None = Depends(optional_api_key),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    # Moonraker-compatible upload that stores files locally and creates a PrintMux job.
    if root != "gcodes":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid root")

    filename = Path(path or file.filename or "upload.gcode").name
    stored_path, size, file_hash = save_upload(file.file, filename)

    file_record = FileModel(
        original_filename=filename,
        storage_path=str(stored_path),
        file_hash=file_hash,
        size=size,
    )
    db.add(file_record)
    db.flush()

    requested_action = "print" if (
        print_start in {"true", "True", "1", "yes", "Yes"}
        or print_flag in {"true", "True", "1", "yes", "Yes"}
    ) else "upload"

    job_record = Job(
        file_id=file_record.id,
        status="awaiting_selection",
        requested_action=requested_action,
    )
    db.add(job_record)
    db.commit()

    return {
        "result": {
            "item": {
                "path": filename,
                "root": "gcodes",
                "size": size,
                "modified": _utc_timestamp(file_record.uploaded_at),
                "permissions": "rw",
            },
            "action": "create_file",
            "print_started": requested_action == "print",
            "print_queued": False,
        }
    }


@router.post("/printer/print/start")
def print_start(
    filename: str | None = Form(default=None),
    filename_query: str | None = Query(default=None, alias="filename"),
    _: str | None = Depends(optional_api_key),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    # Create a job from an existing file and mark it for printing.
    resolved_name = filename or filename_query
    if not resolved_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")

    file_record = (
        db.query(FileModel)
        .filter(FileModel.original_filename == resolved_name)
        .order_by(FileModel.uploaded_at.desc())
        .first()
    )
    if not file_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    job_record = Job(
        file_id=file_record.id,
        status="awaiting_selection",
        requested_action="print",
    )
    db.add(job_record)
    db.commit()

    return {"result": "ok"}
