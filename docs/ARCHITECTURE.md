# Architecture and Flow

## High-Level Overview
PrintMux sits between slicers and multiple printers. It presents both Moonraker-compatible and minimal OctoPrint-compatible endpoints to slicers, then routes each uploaded job to one or more downstream printers using Moonraker APIs.

```
Slicer ──(Moonraker/OctoPrint compat)──> PrintMux API ──> Job Store + UI
                                      └──> Dispatcher ──> Printers (Moonraker)
```

## Core Components
- **Moonraker Compatibility API**: Minimal endpoints so slicers can upload and trigger prints.
- **OctoPrint Compatibility API**: Minimal legacy endpoints for slicers that still expect OctoPrint.
- **Job Manager**: Stores file metadata and job state, tracks per-printer targets.
- **Dispatcher**: Uploads files and starts prints on downstream printers.
- **Printer Status Service**: Polls Moonraker for status and print state.
- **Web UI**: Job inbox, printer management, and dispatch workflows.

## Key Flows

### Upload Flow (Slicer → PrintMux)
1. Slicer uploads file to Moonraker- or OctoPrint-compatible endpoint.
2. PrintMux stores the file on disk and creates a job record.
3. The job appears in the UI, awaiting dispatch.

### Dispatch Flow (UI → Printers)
1. User selects a job and target printers in the UI.
2. PrintMux dispatches the job to selected printers (upload or upload+print).
3. Per-printer target statuses update as printers respond.

### Status Flow (Printers → UI)
1. Frontend polls `/api/printers/status` every 10 seconds.
2. Backend queries Moonraker `/printer/info` and `/printer/objects/query`.
3. Print state is inferred from `print_stats`, `display_status`, and `virtual_sdcard`.

## Storage
- File binaries live on disk (`PRINTMUX_STORAGE_DIR`).
- Metadata and job state live in the database (`PRINTMUX_DATABASE_URL`).

## Reliability Notes
- Printer status calls are time‑bounded to prevent UI hangs.
- State mapping includes fallbacks for firmware variants.
