# Major Functions and Flows

This document highlights critical functions and non-obvious logic used throughout the project.

## Backend

### `dispatch_job` (backend/app/services/dispatcher.py)
Dispatches a job to one or more printers. It:
- Ensures target rows exist
- Sets job to `dispatching`
- Spawns async tasks per printer
- Reconciles final job status based on per-target results

Workaround: Job completion is considered `completed` once upload/print start is confirmed.
Print completion tracking is intentionally out of scope.

### `_dispatch_to_printer`
Uploads a file to a single printer and optionally starts printing.
Includes explicit handling for:
- Disabled printers
- Network failures
- HTTP errors from Moonraker

### `_fetch_status` (backend/app/api/printers/router.py)
Queries Moonraker for runtime status and print state.
Workarounds:
- Accepts `result.status.objects` and `result.status` response shapes.
- Falls back to progress fields when `print_stats.state` is absent.
- Uses an 8s timeout wrapper per printer to avoid UI hangs.

### OctoPrint Compatibility Upload (backend/app/api/octoprint_compat/router.py)
Implements a minimal OctoPrint upload endpoint for slicers that still use that API.
Stores file on disk, creates a `Job`, and sets action based on the `print` flag.

### Moonraker Virtual API (backend/app/api/moonraker/router.py)
Implements a limited Moonraker-compatible API for slicers/tools.
Emulates a simple file manager with PrintMux-managed storage.

## Frontend

### `statusSummary` / `printerCardStyle` (frontend/src/App.tsx)
Normalizes status state strings and determines visual styling and labels.
Workarounds:
- Collapses certain states (e.g., `complete` → `completed`)
- Avoids showing "Printing - Ready" by rendering `Printing` alone

### ETA + Layer Line (frontend/src/App.tsx)
Shows `ETA | layer` while printing.
ETA uses:
1. `total_duration - print_duration`, or
2. `print_duration * (1/progress - 1)` as a fallback.

## References
See also:
- `docs/ARCHITECTURE.md`
- `docs/KNOWN_ISSUES.md`
