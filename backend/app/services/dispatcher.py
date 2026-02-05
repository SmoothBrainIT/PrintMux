from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Iterable

from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.database import SessionLocal
from ..models import File as FileModel
from ..models import Job, JobTarget, Printer
import httpx

from .moonraker_client import MoonrakerClient


TERMINAL_SUCCESS = {"uploaded", "printing"}
TERMINAL_FAILURE = {"failed"}


def _get_job_bundle(db: Session, job_id: int) -> tuple[Job, FileModel]:
    # Fetch job and its file record together; callers treat this as atomic metadata.
    job = db.get(Job, job_id)
    if not job:
        raise ValueError(f"Job {job_id} not found")
    file_record = db.get(FileModel, job.file_id)
    if not file_record:
        raise ValueError(f"File for job {job_id} not found")
    return job, file_record


def _set_job_status_from_targets(db: Session, job: Job, targets: Iterable[JobTarget]) -> None:
    # Aggregate job status from per-target outcomes.
    target_list = list(targets)
    if not target_list:
        job.status = "failed"
        return

    if any(target.status in TERMINAL_FAILURE for target in target_list):
        job.status = "failed"
        return

    if all(target.status in TERMINAL_SUCCESS for target in target_list):
        # Dispatch done; actual print completion is outside initial scope.
        job.status = "completed"
        return

    job.status = "dispatching"


def _ensure_targets(db: Session, job_id: int, printer_ids: list[int]) -> list[JobTarget]:
    # Create missing target rows without duplicating existing entries.
    existing = {
        target.printer_id
        for target in db.query(JobTarget).filter(JobTarget.job_id == job_id).all()
    }
    targets: list[JobTarget] = []
    for printer_id in printer_ids:
        if printer_id in existing:
            continue
        target = JobTarget(job_id=job_id, printer_id=printer_id, status="pending")
        db.add(target)
        targets.append(target)
    return targets


async def dispatch_job(job_id: int, printer_ids: list[int], action: str) -> None:
    # Dispatch fan-out: enqueue one task per printer, then reconcile job state.
    with SessionLocal() as db:
        job, file_record = _get_job_bundle(db, job_id)
        job.status = "dispatching"
        job.requested_action = action
        _ensure_targets(db, job_id, printer_ids)
        db.commit()

    tasks = [
        asyncio.create_task(_dispatch_to_printer(job_id, printer_id, action))
        for printer_id in printer_ids
    ]
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)

    with SessionLocal() as db:
        job = db.get(Job, job_id)
        if not job:
            return
        targets = db.query(JobTarget).filter(JobTarget.job_id == job_id).all()
        _set_job_status_from_targets(db, job, targets)
        db.commit()


async def _dispatch_to_printer(job_id: int, printer_id: int, action: str) -> None:
    # Upload the file to one printer and optionally start printing.
    with SessionLocal() as db:
        job, file_record = _get_job_bundle(db, job_id)
        printer = db.get(Printer, printer_id)
        if not printer:
            return
        if not printer.enabled:
            target = (
                db.query(JobTarget)
                .filter(JobTarget.job_id == job_id, JobTarget.printer_id == printer_id)
                .first()
            )
            if target:
                target.status = "failed"
                target.error_message = "Printer disabled"
                db.commit()
            return
        printer_base_url = printer.base_url
        printer_api_key = printer.api_key
        storage_path = file_record.storage_path
        original_filename = file_record.original_filename
        target = (
            db.query(JobTarget)
            .filter(JobTarget.job_id == job_id, JobTarget.printer_id == printer_id)
            .first()
        )
        if not target:
            target = JobTarget(job_id=job_id, printer_id=printer_id, status="pending")
            db.add(target)
            db.commit()
        target.status = "uploading"
        db.commit()

    client = MoonrakerClient(
        base_url=printer_base_url,
        api_key=printer_api_key,
        timeout_seconds=settings.octoprint_timeout_seconds,
    )

    try:
        await client.upload_file(
            Path(storage_path),
            original_filename,
            start_print=(action == "print"),
        )
    except httpx.HTTPStatusError as exc:  # pragma: no cover - ensures resilience for network errors
        detail = exc.response.text if exc.response is not None else str(exc)
        with SessionLocal() as db:
            target = (
                db.query(JobTarget)
                .filter(JobTarget.job_id == job_id, JobTarget.printer_id == printer_id)
                .first()
            )
            if target:
                target.status = "failed"
                target.error_message = detail
                db.commit()
        return
    except Exception as exc:  # pragma: no cover - ensures resilience for network errors
        with SessionLocal() as db:
            target = (
                db.query(JobTarget)
                .filter(JobTarget.job_id == job_id, JobTarget.printer_id == printer_id)
                .first()
            )
            if target:
                target.status = "failed"
                target.error_message = str(exc)
                db.commit()
        return

    with SessionLocal() as db:
        target = (
            db.query(JobTarget)
            .filter(JobTarget.job_id == job_id, JobTarget.printer_id == printer_id)
            .first()
        )
        if target:
            target.status = "printing" if action == "print" else "uploaded"
            target.error_message = None
            db.commit()
