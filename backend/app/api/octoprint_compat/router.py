from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File as UploadFileParam, Form, UploadFile
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security import require_api_key
from ...core.storage import save_upload
from ...models import File as FileModel, Job

router = APIRouter(prefix="/api", tags=["octoprint"])


@router.get("/version")
def get_version(_: str = Depends(require_api_key)) -> dict[str, Any]:
    return {
        "api": "0.1",
        "server": "1.10.0",
        "text": "OctoPrint",
    }


@router.get("/server")
def get_server(_: str = Depends(require_api_key)) -> dict[str, Any]:
    return {
        "server": "OctoPrint",
        "safe_mode": False,
        "state": "operational",
    }


@router.get("/connection")
def get_connection(_: str = Depends(require_api_key)) -> dict[str, Any]:
    return {
        "current": {
            "state": "Operational",
            "port": "virtual",
            "baudrate": 115200,
        },
        "options": {
            "ports": ["virtual"],
            "baudrates": [115200],
        },
    }


@router.get("/job")
def get_job(_: str = Depends(require_api_key)) -> dict[str, Any]:
    return {
        "state": "Operational",
        "job": None,
        "progress": None,
    }


@router.get("/files")
def list_files(_: str = Depends(require_api_key)) -> dict[str, Any]:
    return {
        "files": [],
        "free": 0,
        "total": 0,
    }


@router.post("/files/local")
def upload_file_local(
    file: UploadFile = UploadFileParam(...),
    select: str | None = Form(default=None),
    print_job: str | None = Form(default=None, alias="print"),
    _: str = Depends(require_api_key),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    # Minimal OctoPrint-compatible upload: store file, create job, and honor print flag.
    filename = Path(file.filename or "upload.gcode").name
    stored_path, size, file_hash = save_upload(file.file, filename)

    file_record = FileModel(
        original_filename=filename,
        storage_path=str(stored_path),
        file_hash=file_hash,
        size=size,
    )
    db.add(file_record)
    db.flush()

    requested_action = "print" if print_job in {"true", "True", "1", "yes", "Yes"} else "upload"

    job_record = Job(
        file_id=file_record.id,
        status="awaiting_selection",
        requested_action=requested_action,
    )
    db.add(job_record)
    db.commit()

    return {
        "done": True,
        "files": {
            "local": {
                "name": filename,
                "origin": "local",
                "path": filename,
                "refs": {
                    "resource": f"/api/files/local/{filename}",
                    "download": f"/downloads/files/local/{filename}",
                },
                "size": size,
            }
        },
    }
