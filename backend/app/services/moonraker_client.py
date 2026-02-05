from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx


@dataclass(frozen=True)
class MoonrakerClient:
    base_url: str
    api_key: str | None = None
    timeout_seconds: int = 60

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            return {}
        return {"X-Api-Key": self.api_key}

    async def upload_file(
        self,
        file_path: Path,
        original_filename: str,
        start_print: bool,
    ) -> dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/server/files/upload"
        data: dict[str, str] = {"root": "gcodes", "path": original_filename}
        if start_print:
            data["print"] = "true"
            data["print_start"] = "true"

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            with file_path.open("rb") as handle:
                files = {"file": (original_filename, handle, "application/octet-stream")}
                response = await client.post(url, headers=self._headers(), data=data, files=files)

        response.raise_for_status()
        return response.json()

    async def start_print(self, filename: str) -> dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/printer/print/start"
        data = {"filename": filename}
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(url, headers=self._headers(), data=data)

        response.raise_for_status()
        return response.json()

    async def server_info(self) -> dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/server/info"
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(url, headers=self._headers())
        response.raise_for_status()
        return response.json()

    async def printer_info(self) -> dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/printer/info"
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(url, headers=self._headers())
        response.raise_for_status()
        return response.json()

    async def printer_objects_query(self, objects: list[str]) -> dict[str, Any]:
        # Use structured POST payload to avoid firmware-specific query parsing issues.
        url = f"{self.base_url.rstrip('/')}/printer/objects/query"
        payload = {"objects": {name: None for name in objects}}
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(url, headers=self._headers(), json=payload)
        response.raise_for_status()
        return response.json()

    async def printer_objects_list(self) -> dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/printer/objects/list"
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(url, headers=self._headers())
        response.raise_for_status()
        return response.json()

    async def list_files(self, root: str = "gcodes") -> list[dict[str, Any]]:
        url = f"{self.base_url.rstrip('/')}/server/files/list"
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(url, headers=self._headers(), params={"root": root})
        response.raise_for_status()
        payload = response.json()
        result = payload.get("result", payload)
        if isinstance(result, list):
            return result
        return []

    async def get_directory(self, path: str, extended: bool = False) -> dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/server/files/directory"
        params = {"path": path, "extended": str(extended).lower()}
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(url, headers=self._headers(), params=params)
        response.raise_for_status()
        return response.json().get("result", {})

    async def delete_file(self, root: str, filename: str) -> dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/server/files/{root}/{filename}"
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.delete(url, headers=self._headers())
        response.raise_for_status()
        return response.json()

    async def delete_directory(self, path: str, force: bool = False) -> dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/server/files/directory"
        params = {"path": path, "force": str(force).lower()}
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.delete(url, headers=self._headers(), params=params)
        response.raise_for_status()
        return response.json()

    async def move_path(self, source: str, dest: str) -> dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/server/files/move"
        params = {"source": source, "dest": dest}
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(url, headers=self._headers(), params=params)
        response.raise_for_status()
        return response.json()
