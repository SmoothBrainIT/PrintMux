from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx


@dataclass(frozen=True)
class OctoPrintClient:
    base_url: str
    api_key: str
    timeout_seconds: int = 60

    def _headers(self) -> dict[str, str]:
        return {"X-Api-Key": self.api_key}

    async def upload_file(
        self,
        file_path: Path,
        original_filename: str,
        start_print: bool,
    ) -> dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/api/files/local"
        data: dict[str, str] = {"select": "true"}
        if start_print:
            data = {"print": "true"}

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            with file_path.open("rb") as handle:
                files = {"file": (original_filename, handle, "application/octet-stream")}
                response = await client.post(url, headers=self._headers(), data=data, files=files)

        response.raise_for_status()
        return response.json()
