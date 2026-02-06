export type Printer = {
  id: number;
  name: string;
  base_url: string;
  enabled: boolean;
  tags?: string | null;
  created_at: string;
};

export type WebUiLink = {
  label: string;
  url: string;
};

export type PrinterStatus = {
  id: number;
  online: boolean;
  state: string;
  state_message: string;
  web_uis: WebUiLink[];
  progress?: number | null;
  print_duration?: number | null;
  total_duration?: number | null;
  current_layer?: number | null;
  total_layers?: number | null;
};

export type PrinterFile = {
  path: string;
  size: number;
  modified: number;
  permissions?: string | null;
};

export type PrinterDirectoryItem = {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number | null;
  modified?: number | null;
  permissions?: string | null;
};

export type PrinterDirectory = {
  path: string;
  items: PrinterDirectoryItem[];
};

export type JobTarget = {
  id: number;
  printer_id: number;
  status: string;
  error_message?: string | null;
};

export type JobFile = {
  id: number;
  original_filename: string;
  size: number;
  uploaded_at: string;
};

export type Job = {
  id: number;
  status: string;
  requested_action: string;
  created_at: string;
  file: JobFile;
  targets: JobTarget[];
};

export type PrinterCreate = {
  name: string;
  base_url: string;
  api_key: string | null;
  enabled?: boolean;
  tags?: string | null;
};

export type PrinterUpdate = {
  name?: string;
  base_url?: string;
  api_key?: string | null;
  enabled?: boolean;
  tags?: string | null;
};

export type ApiKeyResponse = {
  api_key: string;
};

const DEFAULT_BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT ?? "8000";
const RAW_HOST = import.meta.env.VITE_HOST;
const DEFAULT_HOST =
  RAW_HOST && RAW_HOST.trim().length > 0
    ? RAW_HOST
    : typeof window === "undefined"
      ? "localhost"
      : window.location.hostname;
const DEFAULT_PROTOCOL =
  typeof window === "undefined" ? "http:" : window.location.protocol;
const API_BASE = `${DEFAULT_PROTOCOL}//${DEFAULT_HOST}:${DEFAULT_BACKEND_PORT}`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  listPrinters: () => request<Printer[]>("/api/printers"),
  listPrinterStatus: () => request<PrinterStatus[]>("/api/printers/status"),
  createPrinter: (payload: PrinterCreate) =>
    request<Printer>("/api/printers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updatePrinter: (printerId: number, payload: PrinterUpdate) =>
    request<Printer>(`/api/printers/${printerId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deletePrinter: (printerId: number) =>
    request<void>(`/api/printers/${printerId}`, {
      method: "DELETE",
    }),
  testPrinter: (printerId: number) =>
    request<PrinterStatus>(`/api/printers/${printerId}/test`, {
      method: "POST",
    }),
  listPrinterFiles: (printerId: number) =>
    request<PrinterFile[]>(`/api/printers/${printerId}/files`),
  printPrinterFile: (printerId: number, filename: string) =>
    request<{ status: string }>(`/api/printers/${printerId}/files/print`, {
      method: "POST",
      body: JSON.stringify({ filename }),
    }),
  listPrinterDirectory: (printerId: number, path: string) =>
    request<PrinterDirectory>(`/api/printers/${printerId}/filesystem?path=${encodeURIComponent(path)}`),
  deletePrinterPath: (printerId: number, path: string, targetType: "file" | "dir") =>
    request<{ status: string }>(`/api/printers/${printerId}/filesystem/delete`, {
      method: "POST",
      body: JSON.stringify({ path, target_type: targetType }),
    }),
  movePrinterPath: (printerId: number, source: string, dest: string) =>
    request<{ status: string }>(`/api/printers/${printerId}/filesystem/move`, {
      method: "POST",
      body: JSON.stringify({ source, dest }),
    }),
  listJobs: () => request<Job[]>("/api/jobs"),
  latestJob: () => request<Job>("/api/jobs/latest"),
  dispatchJob: (jobId: number, printerIds: number[], action: "upload" | "print") =>
    request<{ status: string }>(`/api/jobs/${jobId}/dispatch`, {
      method: "POST",
      body: JSON.stringify({ printer_ids: printerIds, action }),
    }),
  renameJobFile: (jobId: number, filename: string) =>
    request<Job>(`/api/jobs/${jobId}/file`, {
      method: "PATCH",
      body: JSON.stringify({ filename }),
    }),
  deleteJobs: (jobIds: number[]) =>
    request<{ deleted_jobs: number; deleted_files: number }>("/api/jobs/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ job_ids: jobIds }),
    }),
  getApiKey: () => request<ApiKeyResponse>("/api/settings/api-key"),
  rotateApiKey: () => request<ApiKeyResponse>("/api/settings/api-key/rotate", { method: "POST" }),
};
