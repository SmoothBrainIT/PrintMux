# Known Issues and Caveats

## Printer Status Detection
- Some Moonraker installations return `objects_query` data under `result.status.objects` instead of `result.status`.
  PrintMux accounts for both shapes.
- When a printer is slow to respond, the status endpoint times out per printer after 8 seconds and marks it as offline.
  This prevents the UI from hanging but may show "offline" briefly during network hiccups.

## Print State Granularity
- `print_stats.state` is the preferred signal, but some firmware variants only update progress fields.
  PrintMux falls back to `display_status.progress` and `virtual_sdcard.is_active` to infer printing.
- Layer count may not be provided by the firmware; ETA/layer line will fall back to the printer's state message.

## Dispatch Feedback
- Dispatch feedback indicates that PrintMux accepted and queued the request.
  It does not guarantee downstream printers completed the upload or started printing.
  For real-time confirmation, rely on per-printer status updates.
