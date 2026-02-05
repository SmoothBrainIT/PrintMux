# PrintMux

PrintMux is an open-source middleware layer that lets slicers upload once and dispatch to many 3D printers. It presents both a Moonraker-compatible API and a minimal OctoPrint-compatible API for slicers, then routes jobs to one or more downstream printers from the web UI.

## Features
- Moonraker-compatible upload endpoint for slicers
- Minimal OctoPrint-compatible upload endpoint for slicers
- Centralized web UI for job dispatch
- Multi-printer status and health visibility
- Per-printer UI deep links
- Self-hosted and lightweight

## Repository Layout
- `backend/` FastAPI service and printer integrations
- `frontend/` React + Vite UI
- `docker/` container build files and compose

## Quick Start (Local)

### Backend
```bash
python -m venv .venv
.venv/Scripts/activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Environment Variables
Backend (via `.env` in the repo root):
- `PRINTMUX_API_KEY` – API key for slicer access
- `PRINTMUX_DATABASE_URL` – default `sqlite:///./printmux.db`
- `PRINTMUX_STORAGE_DIR` – default `./storage`
- `PRINTMUX_CORS_ORIGINS` – default `*`

Frontend (via `frontend/.env`):
- `VITE_API_BASE` – default `http://localhost:8000`

See `.env.example` and `frontend/.env.example` for templates.

## Docker
```bash
docker compose up --build
```

### Docker Environment Overrides
Update the root `.env` to customize (used automatically by Docker Compose):
- `PRINTMUX_BACKEND_PORT` (default 8000)
- `PRINTMUX_FRONTEND_PORT` (default 5173)
- `VITE_API_BASE` (browser-facing backend URL)

Note: `docker/.env.example` is kept for reference, but the root `.env` is the primary source of truth.

## Caveats and Workarounds
- Status polling times out per printer after 8 seconds to avoid UI hangs.
- Print state detection may fall back to progress signals if `print_stats.state` is not available.
- Dispatch success indicates PrintMux accepted the request, not that downstream prints completed.

See:
- `docs/KNOWN_ISSUES.md`
- `docs/OPERATIONS.md`
- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/FUNCTIONS.md`

## License
MIT. See `LICENSE`.

## Contributing
See `CONTRIBUTING.md`.
