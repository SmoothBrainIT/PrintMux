from __future__ import annotations

from datetime import datetime
import asyncio
from typing import Any, List, Optional

from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.database import get_db
from ...models import JobTarget, Printer
from ...services.moonraker_client import MoonrakerClient
from ...services.webui_discovery import discover_web_uis

router = APIRouter(prefix="/api/printers", tags=["printers"])
STATUS_TIMEOUT_SECONDS = 8


class PrinterCreate(BaseModel):
    name: str
    base_url: str
    api_key: Optional[str] = None
    enabled: bool = True
    tags: Optional[str] = None


class PrinterUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    enabled: Optional[bool] = None
    tags: Optional[str] = None


class PrinterOut(BaseModel):
    id: int
    name: str
    base_url: str
    enabled: bool
    tags: Optional[str]
    created_at: datetime

    class Config:
        orm_mode = True


class WebUiOut(BaseModel):
    label: str
    url: str


class PrinterStatusOut(BaseModel):
    id: int
    online: bool
    state: str
    state_message: str
    web_uis: List[WebUiOut]
    progress: Optional[float] = None
    print_duration: Optional[float] = None
    total_duration: Optional[float] = None
    current_layer: Optional[int] = None
    total_layers: Optional[int] = None


class PrinterFileOut(BaseModel):
    path: str
    size: int
    modified: float
    permissions: str | None = None


class PrinterDirectoryItemOut(BaseModel):
    name: str
    path: str
    type: str
    size: int | None = None
    modified: float | None = None
    permissions: str | None = None


class PrinterDirectoryOut(BaseModel):
    path: str
    items: List[PrinterDirectoryItemOut]


class PrinterDeleteRequest(BaseModel):
    path: str
    target_type: str
    force: bool = False


class PrinterMoveRequest(BaseModel):
    source: str
    dest: str


class PrinterPrintRequest(BaseModel):
    filename: str


async def _fetch_status(printer: Printer) -> PrinterStatusOut:
    # Query Moonraker for connectivity and runtime status, with fallbacks for firmware variants.
    client = MoonrakerClient(
        base_url=printer.base_url,
        api_key=printer.api_key,
        timeout_seconds=settings.octoprint_timeout_seconds,
    )

    state = "offline"
    state_message = "Printer unreachable"
    online = False
    progress: float | None = None
    print_duration: float | None = None
    total_duration: float | None = None
    current_layer: int | None = None
    total_layers: int | None = None

    try:
        info = await client.printer_info()
        result = info.get("result", {})
        state = result.get("state", "unknown")
        state_message = result.get("state_message", "")
        online = True
        try:
            objects = await client.printer_objects_query(
                ["print_stats", "webhooks", "virtual_sdcard", "display_status"]
            )
            status = objects.get("result", {}).get("status", {})
            if isinstance(status.get("objects"), dict):
                status = status.get("objects", {})
            print_stats = status.get("print_stats", {})
            webhooks = status.get("webhooks", {})
            virtual_sdcard = status.get("virtual_sdcard", {})
            display_status = status.get("display_status", {})
            print_state = print_stats.get("state")
            is_active = virtual_sdcard.get("is_active")
            progress = virtual_sdcard.get("progress") or 0
            if print_state and print_state != "standby":
                state = print_state
            elif display_status.get("progress") is not None and display_status.get("progress", 0) > 0:
                state = "printing"
            elif is_active or progress > 0:
                state = "printing"
            elif print_state:
                state = print_state
            webhook_message = webhooks.get("message") or webhooks.get("state_message")
            if webhook_message:
                state_message = webhook_message
            if isinstance(display_status, dict):
                progress = display_status.get("progress", progress)
            if isinstance(print_stats, dict):
                print_duration = print_stats.get("print_duration")
                total_duration = print_stats.get("total_duration")
                info = print_stats.get("info") or {}
                if isinstance(info, dict):
                    current_layer = info.get("current_layer") or info.get("layer") or current_layer
                    total_layers = info.get("total_layer") or info.get("layer_count") or total_layers
        except Exception:
            pass
    except Exception:
        pass

    web_uis = await discover_web_uis(printer.base_url)

    return PrinterStatusOut(
        id=printer.id,
        online=online,
        state=state,
        state_message=state_message,
        web_uis=[WebUiOut(label=link.label, url=link.url) for link in web_uis],
        progress=progress,
        print_duration=print_duration,
        total_duration=total_duration,
        current_layer=current_layer,
        total_layers=total_layers,
    )


@router.get("", response_model=List[PrinterOut])
def list_printers(db: Session = Depends(get_db)) -> List[Printer]:
    return db.query(Printer).order_by(Printer.created_at.desc()).all()


@router.post("", response_model=PrinterOut, status_code=status.HTTP_201_CREATED)
def create_printer(payload: PrinterCreate, db: Session = Depends(get_db)) -> Printer:
    printer = Printer(
        name=payload.name,
        base_url=payload.base_url,
        api_key=payload.api_key,
        enabled=payload.enabled,
        tags=payload.tags,
    )
    db.add(printer)
    db.commit()
    db.refresh(printer)
    return printer


@router.patch("/{printer_id}", response_model=PrinterOut)
def update_printer(printer_id: int, payload: PrinterUpdate, db: Session = Depends(get_db)) -> Printer:
    printer = db.get(Printer, printer_id)
    if not printer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Printer not found")

    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(printer, key, value)

    db.commit()
    db.refresh(printer)
    return printer


@router.delete("/{printer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_printer(printer_id: int, db: Session = Depends(get_db)) -> Response:
    printer = db.get(Printer, printer_id)
    if not printer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Printer not found")

    has_targets = (
        db.query(JobTarget).filter(JobTarget.printer_id == printer_id).first() is not None
    )
    if has_targets:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Printer has job history. Disable instead of deleting.",
        )

    db.delete(printer)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/status", response_model=List[PrinterStatusOut])
async def list_printer_status(db: Session = Depends(get_db)) -> List[PrinterStatusOut]:
    # Time-bound per-printer status to prevent UI hangs when a device is unreachable.
    printers = db.query(Printer).order_by(Printer.created_at.desc()).all()
    async def _safe_fetch(printer: Printer) -> PrinterStatusOut:
        try:
            return await asyncio.wait_for(_fetch_status(printer), timeout=STATUS_TIMEOUT_SECONDS)
        except Exception:
            return PrinterStatusOut(
                id=printer.id,
                online=False,
                state="offline",
                state_message="Status timeout",
                web_uis=[],
            )

    results = await asyncio.gather(*[_safe_fetch(printer) for printer in printers])
    return list(results)


@router.get("/{printer_id}/status", response_model=PrinterStatusOut)
async def get_printer_status(printer_id: int, db: Session = Depends(get_db)) -> PrinterStatusOut:
    printer = db.get(Printer, printer_id)
    if not printer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Printer not found")
    try:
        return await asyncio.wait_for(_fetch_status(printer), timeout=STATUS_TIMEOUT_SECONDS)
    except Exception:
        return PrinterStatusOut(
            id=printer.id,
            online=False,
            state="offline",
            state_message="Status timeout",
            web_uis=[],
        )


@router.get("/{printer_id}/status/raw")
async def get_printer_status_raw(printer_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    printer = db.get(Printer, printer_id)
    if not printer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Printer not found")

    client = MoonrakerClient(
        base_url=printer.base_url,
        api_key=printer.api_key,
        timeout_seconds=settings.octoprint_timeout_seconds,
    )

    payload: dict[str, Any] = {"printer_id": printer_id}
    try:
        payload["printer_info"] = await client.printer_info()
    except Exception as exc:
        payload["printer_info_error"] = str(exc)

    try:
        payload["objects_query"] = await client.printer_objects_query(
            ["print_stats", "webhooks", "virtual_sdcard", "toolhead", "gcode_move"]
        )
    except Exception as exc:
        payload["objects_query_error"] = str(exc)

    try:
        payload["objects_list"] = await client.printer_objects_list()
    except Exception as exc:
        payload["objects_list_error"] = str(exc)

    try:
        payload["server_info"] = await client.server_info()
    except Exception as exc:
        payload["server_info_error"] = str(exc)

    return payload


@router.post("/{printer_id}/test", response_model=PrinterStatusOut)
async def test_printer(printer_id: int, db: Session = Depends(get_db)) -> PrinterStatusOut:
    printer = db.get(Printer, printer_id)
    if not printer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Printer not found")
    return await _fetch_status(printer)


@router.get("/{printer_id}/files", response_model=List[PrinterFileOut])
async def list_printer_files(printer_id: int, db: Session = Depends(get_db)) -> List[PrinterFileOut]:
    printer = db.get(Printer, printer_id)
    if not printer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Printer not found")

    client = MoonrakerClient(
        base_url=printer.base_url,
        api_key=printer.api_key,
        timeout_seconds=settings.octoprint_timeout_seconds,
    )
    files = await client.list_files()
    return [
        PrinterFileOut(
            path=file.get("path", ""),
            size=int(file.get("size") or 0),
            modified=float(file.get("modified") or 0),
            permissions=file.get("permissions"),
        )
        for file in files
        if file.get("path")
    ]


@router.get("/{printer_id}/filesystem", response_model=PrinterDirectoryOut)
async def list_printer_directory(
    printer_id: int,
    path: str = "gcodes",
    db: Session = Depends(get_db),
) -> PrinterDirectoryOut:
    printer = db.get(Printer, printer_id)
    if not printer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Printer not found")

    client = MoonrakerClient(
        base_url=printer.base_url,
        api_key=printer.api_key,
        timeout_seconds=settings.octoprint_timeout_seconds,
    )

    result = await client.get_directory(path, extended=True)
    items: list[PrinterDirectoryItemOut] = []

    dirs = result.get("dirs") or []
    files = result.get("files") or []
    def _name_from_path(path_value: str) -> str:
        cleaned = path_value.rstrip("/") if path_value else ""
        return cleaned.rsplit("/", 1)[-1] if cleaned else ""

    if result.get("items"):
        for entry in result["items"]:
            entry_type = entry.get("type") or "file"
            entry_path = entry.get("path") or entry.get("name") or ""
            name = entry.get("name") or _name_from_path(entry_path)
            if entry_path == path and not entry.get("name"):
                name = _name_from_path(entry.get("name") or entry_path)
            items.append(
                PrinterDirectoryItemOut(
                    name=name,
                    path=entry_path,
                    type=entry_type,
                    size=entry.get("size"),
                    modified=entry.get("modified"),
                    permissions=entry.get("permissions"),
                )
            )
    else:
        for entry in dirs:
            dirname = entry.get("dirname") or entry.get("name") or ""
            entry_path = entry.get("path") or (f"{path.rstrip('/')}/{dirname}" if dirname else "")
            name = entry.get("name") or dirname or _name_from_path(entry_path)
            if not entry_path:
                entry_path = f"{path.rstrip('/')}/{name}"
            items.append(
                PrinterDirectoryItemOut(
                    name=name,
                    path=entry_path,
                    type="dir",
                    size=entry.get("size"),
                    modified=entry.get("modified"),
                    permissions=entry.get("permissions"),
                )
            )
        for entry in files:
            filename = entry.get("filename") or entry.get("name") or ""
            entry_path = entry.get("path") or (f"{path.rstrip('/')}/{filename}" if filename else "")
            name = entry.get("name") or filename or _name_from_path(entry_path)
            if not entry_path:
                entry_path = f"{path.rstrip('/')}/{name}"
            items.append(
                PrinterDirectoryItemOut(
                    name=name,
                    path=entry_path,
                    type="file",
                    size=entry.get("size"),
                    modified=entry.get("modified"),
                    permissions=entry.get("permissions"),
                )
            )

    items.sort(key=lambda entry: (entry.type != "dir", entry.name.lower()))
    return PrinterDirectoryOut(path=path, items=items)


@router.get("/{printer_id}/filesystem/raw")
async def list_printer_directory_raw(
    printer_id: int,
    path: str = "gcodes",
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    printer = db.get(Printer, printer_id)
    if not printer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Printer not found")

    client = MoonrakerClient(
        base_url=printer.base_url,
        api_key=printer.api_key,
        timeout_seconds=settings.octoprint_timeout_seconds,
    )
    result = await client.get_directory(path, extended=True)
    return {"path": path, "result": result}


@router.post("/{printer_id}/filesystem/delete")
async def delete_printer_path(
    printer_id: int,
    payload: PrinterDeleteRequest,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    printer = db.get(Printer, printer_id)
    if not printer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Printer not found")

    client = MoonrakerClient(
        base_url=printer.base_url,
        api_key=printer.api_key,
        timeout_seconds=settings.octoprint_timeout_seconds,
    )

    if payload.target_type == "dir":
        await client.delete_directory(payload.path, force=payload.force)
    else:
        root, filename = (payload.path.split("/", 1) + [""])[:2]
        await client.delete_file(root or "gcodes", filename)

    return {"status": "deleted"}


@router.post("/{printer_id}/filesystem/move")
async def move_printer_path(
    printer_id: int,
    payload: PrinterMoveRequest,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    printer = db.get(Printer, printer_id)
    if not printer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Printer not found")

    client = MoonrakerClient(
        base_url=printer.base_url,
        api_key=printer.api_key,
        timeout_seconds=settings.octoprint_timeout_seconds,
    )
    await client.move_path(payload.source, payload.dest)
    return {"status": "moved"}


@router.post("/{printer_id}/files/print")
async def print_printer_file(
    printer_id: int,
    payload: PrinterPrintRequest,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    printer = db.get(Printer, printer_id)
    if not printer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Printer not found")

    client = MoonrakerClient(
        base_url=printer.base_url,
        api_key=printer.api_key,
        timeout_seconds=settings.octoprint_timeout_seconds,
    )
    await client.start_print(payload.filename)
    return {"status": "started"}
