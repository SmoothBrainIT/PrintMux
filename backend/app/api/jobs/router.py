from __future__ import annotations

import asyncio
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...models import File as FileModel
from ...models import Job
from ...services.dispatcher import dispatch_job

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class FileOut(BaseModel):
    id: int
    original_filename: str
    size: int
    uploaded_at: datetime

    class Config:
        orm_mode = True


class JobTargetOut(BaseModel):
    id: int
    printer_id: int
    status: str
    error_message: Optional[str]

    class Config:
        orm_mode = True


class JobOut(BaseModel):
    id: int
    status: str
    requested_action: str
    created_at: datetime
    file: FileOut
    targets: List[JobTargetOut]

    class Config:
        orm_mode = True


class JobDispatchRequest(BaseModel):
    printer_ids: List[int]
    action: str = "upload"


class JobRenameRequest(BaseModel):
    filename: str


class JobBulkDeleteRequest(BaseModel):
    job_ids: List[int]


@router.get("", response_model=List[JobOut])
def list_jobs(limit: int = 20, db: Session = Depends(get_db)) -> List[Job]:
    return db.query(Job).order_by(Job.created_at.desc()).limit(limit).all()


@router.get("/latest", response_model=JobOut)
def latest_job(db: Session = Depends(get_db)) -> Job:
    job = db.query(Job).order_by(Job.created_at.desc()).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No jobs found")
    return job


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: int, db: Session = Depends(get_db)) -> Job:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


@router.post("/{job_id}/dispatch")
async def dispatch(job_id: int, payload: JobDispatchRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if not payload.printer_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No printers selected")

    action = payload.action.lower()
    if action not in {"upload", "print"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid action")

    asyncio.create_task(dispatch_job(job_id, payload.printer_ids, action))

    return {"status": "dispatching"}


@router.patch("/{job_id}/file", response_model=JobOut)
def rename_job_file(job_id: int, payload: JobRenameRequest, db: Session = Depends(get_db)) -> Job:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    original_name = job.file.original_filename
    original_suffix = Path(original_name).suffix
    incoming = Path(payload.filename).name.strip()
    if not incoming:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Filename is required")
    incoming_stem = Path(incoming).stem
    filename = f"{incoming_stem}{original_suffix}" if original_suffix else incoming
    if not filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Filename is required")

    job.file.original_filename = filename
    db.commit()
    db.refresh(job)
    return job


@router.post("/bulk-delete")
def bulk_delete_jobs(payload: JobBulkDeleteRequest, db: Session = Depends(get_db)) -> dict[str, int]:
    if not payload.job_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No jobs selected")

    jobs = db.query(Job).filter(Job.id.in_(payload.job_ids)).all()
    if not jobs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Jobs not found")

    file_ids = {job.file_id for job in jobs}
    deleted_jobs = len(jobs)

    for job in jobs:
        db.delete(job)
    db.flush()

    deleted_files = 0
    for file_id in file_ids:
        still_used = db.query(Job).filter(Job.file_id == file_id).first()
        if still_used:
            continue
        file_record = db.get(FileModel, file_id)
        if not file_record:
            continue
        try:
            Path(file_record.storage_path).unlink(missing_ok=True)
        except OSError:
            pass
        db.delete(file_record)
        deleted_files += 1

    db.commit()
    return {"deleted_jobs": deleted_jobs, "deleted_files": deleted_files}
