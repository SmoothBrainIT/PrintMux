# API Overview

Base URL: `http://<host>:8000`

## Printers
- `GET /api/printers`
  - List printers.
- `POST /api/printers`
  - Create printer.
- `PATCH /api/printers/{printer_id}`
  - Update printer.
- `DELETE /api/printers/{printer_id}`
  - Delete printer (only if no job history).
- `GET /api/printers/status`
  - List status for all printers.
- `GET /api/printers/{printer_id}/status`
  - Status for one printer.
- `GET /api/printers/{printer_id}/status/raw`
  - Raw Moonraker status payload (debug).
- `POST /api/printers/{printer_id}/test`
  - Trigger a status test.
- `GET /api/printers/{printer_id}/files`
  - List printer files (Moonraker).
- `GET /api/printers/{printer_id}/filesystem`
  - List printer directory contents.
- `GET /api/printers/{printer_id}/filesystem/raw`
  - Raw directory response.
- `POST /api/printers/{printer_id}/filesystem/delete`
  - Delete file or directory.
- `POST /api/printers/{printer_id}/filesystem/move`
  - Move/rename file or directory.
- `POST /api/printers/{printer_id}/files/print`
  - Start print for a printer-stored file.

## Jobs
- `GET /api/jobs`
  - List jobs.
- `GET /api/jobs/latest`
  - Get most recent job.
- `GET /api/jobs/{job_id}`
  - Get a job by id.
- `POST /api/jobs/{job_id}/dispatch`
  - Dispatch job to printers.
- `PATCH /api/jobs/{job_id}/file`
  - Rename job file (extension preserved).
- `POST /api/jobs/bulk-delete`
  - Delete jobs and cleanup unused files.

## Settings
- `GET /api/settings/api-key`
  - Fetch API key.
- `POST /api/settings/api-key/rotate`
  - Rotate API key.

## OctoPrint Compatibility (Legacy)
- `GET /api/octoprint/server`
- `GET /api/octoprint/version`
- `GET /api/octoprint/files`
- `POST /api/octoprint/files/local`
- `POST /api/octoprint/job`

## Moonraker Compatibility (Virtual)
- `GET /server/info`
- `GET /printer/info`
- `GET /printer/objects/list`
- `GET /printer/objects/query`
- `GET /server/files/roots`
- `GET /server/files/list`
- `POST /server/files/upload`
- `POST /printer/print/start`

## Notes
- Authentication for slicers uses `PRINTMUX_API_KEY`.
- All JSON responses use standard FastAPI/Pydantic models.
