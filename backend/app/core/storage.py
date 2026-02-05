from __future__ import annotations

import hashlib
import uuid
from pathlib import Path
from typing import BinaryIO, Tuple

from .config import ensure_storage_dir


CHUNK_SIZE = 1024 * 1024


def _unique_filename(original_name: str) -> str:
    suffix = Path(original_name).suffix
    stem = Path(original_name).stem
    return f"{stem}-{uuid.uuid4().hex}{suffix}"


def save_upload(file_obj: BinaryIO, filename: str) -> Tuple[Path, int, str]:
    storage_dir = ensure_storage_dir()
    unique_name = _unique_filename(filename)
    target_path = storage_dir / unique_name

    hasher = hashlib.sha256()
    size = 0

    with target_path.open("wb") as target:
        while True:
            chunk = file_obj.read(CHUNK_SIZE)
            if not chunk:
                break
            size += len(chunk)
            hasher.update(chunk)
            target.write(chunk)

    return target_path, size, hasher.hexdigest()
