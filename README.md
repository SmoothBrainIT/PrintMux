# PrintMux

![PrintMux Logo](frontend/src/img/printmux-logo.png)
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
- `PRINTMUX_API_KEY` - API key for slicer access
- `PRINTMUX_DATABASE_URL` - default `sqlite:///./printmux.db`
- `PRINTMUX_STORAGE_DIR` - default `./storage`
- `PRINTMUX_CORS_ORIGINS` - default `*`

Frontend (via `frontend/.env`):
- `VITE_API_BASE` - default `http://localhost:8000`

See `.env.example` and `frontend/.env.example` for templates.

## Docker
Linux (desktop or headless):
1. Clone repo
```bash
git clone https://github.com/SmoothBrainIT/PrintMux.git
```
2. `cd` into repo
```bash
cd PrintMux
```
3. Copy env
```bash
cp .env.example .env
```
4. Modify `.env` if needed
```bash
nano .env
```
5. Deploy
```bash
docker compose up -d
```
Optional: set ports inline for a one-off run (instead of editing `.env` and running the command above)
```bash
PRINTMUX_BACKEND_PORT=8001 PRINTMUX_FRONTEND_PORT=5174 docker compose up -d
```
6. Enjoy PrintMux!

Repo: https://github.com/SmoothBrainIT/PrintMux
Website: https://printmux.com
Docs: https://printmux.com/docs.html

### Docker Environment Overrides
Ports are published by default.
Update the root `.env` to customize (used automatically by Docker Compose),
or set values inline before `docker compose up -d`.
Port values control the published host ports:
- `PRINTMUX_BACKEND_PORT` (default 8000)
- `PRINTMUX_FRONTEND_PORT` (default 5173)
- `VITE_API_BASE` (browser-facing backend URL)

Note: `docker/.env.example` is kept for reference, but the root `.env` is the primary source of truth.

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



