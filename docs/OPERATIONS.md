# Operations Guide

## Storage
- Uploaded files are stored in the directory set by `PRINTMUX_STORAGE_DIR` (default `./storage`).
- The database only stores metadata; files are stored on disk.

## Database
- Default database: SQLite at `./printmux.db`.
- Use `PRINTMUX_DATABASE_URL` to point to Postgres or another supported DB.

## Timeouts
- Printer status fetches are bounded to 8 seconds per printer to prevent UI hangs.
- Downstream API timeouts use `PRINTMUX_OCTOPRINT_TIMEOUT_SECONDS` (default 60s).

## Docker Ports
- Ports are published by default.
- Configure `PRINTMUX_BACKEND_PORT` and `PRINTMUX_FRONTEND_PORT` in the root `.env` to change exposed ports,
  or set them inline before `docker compose up -d`.
- `VITE_API_BASE` should match the browser-accessible backend URL.

## Moonraker Compatibility
- PrintMux uses Moonraker `/printer/info` and `/printer/objects/query`.
- Some firmware variants return object status inside `result.status.objects`.
  PrintMux handles both shapes.

## Security
- Slicer access uses `PRINTMUX_API_KEY`.
- Set a strong API key and avoid exposing the backend directly to the public internet.
