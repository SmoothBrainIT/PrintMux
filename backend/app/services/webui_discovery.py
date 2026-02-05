from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx


TITLE_RE = re.compile(r"<title>(.*?)</title>", re.IGNORECASE | re.DOTALL)


@dataclass(frozen=True)
class WebUiLink:
    label: str
    url: str


def _base_origin(url: str) -> tuple[str, str, int | None]:
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    scheme = parsed.scheme or "http"
    port = parsed.port
    return scheme, hostname, port


def _origin_url(scheme: str, hostname: str, port: int | None) -> str:
    if not hostname:
        return ""
    netloc = hostname if port is None else f"{hostname}:{port}"
    return urlunparse((scheme, netloc, "", "", "", ""))


def _label_from_title(title: str) -> str:
    normalized = title.strip().lower()
    if "mainsail" in normalized:
        return "Mainsail"
    if "fluidd" in normalized:
        return "Fluidd"
    if "klipper" in normalized:
        return "Klipper"
    return "Web UI"


async def _probe_url(client: httpx.AsyncClient, url: str) -> WebUiLink | None:
    try:
        response = await client.get(url, follow_redirects=True)
        if response.status_code >= 400:
            return None
        match = TITLE_RE.search(response.text or "")
        label = _label_from_title(match.group(1)) if match else "Web UI"
        return WebUiLink(label=label, url=str(response.url))
    except Exception:
        return None


async def discover_web_uis(base_url: str, timeout_seconds: int = 2) -> list[WebUiLink]:
    scheme, hostname, port = _base_origin(base_url)
    if not hostname:
        return []

    candidates = [
        _origin_url(scheme, hostname, None),
        _origin_url(scheme, hostname, 4408),
        _origin_url(scheme, hostname, 80),
        _origin_url(scheme, hostname, 443),
    ]

    unique_candidates = [url for url in dict.fromkeys(candidates) if url]

    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        results = await asyncio.gather(
            *[_probe_url(client, url) for url in unique_candidates],
            return_exceptions=False,
        )

    links = [result for result in results if result]
    return links
