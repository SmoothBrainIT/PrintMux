
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, Job, Printer, PrinterDirectoryItem, PrinterStatus } from "./api/client";
import logoUrl from "./img/printmux-logo.png";

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const formatTime = (value: string) => new Date(value).toLocaleString();

const formatDurationShort = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
};

const stripExtension = (filename: string) => {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? filename.slice(0, lastDot) : filename;
};

const splitExtension = (filename: string) => {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? { base: filename.slice(0, lastDot), ext: filename.slice(lastDot) } : { base: filename, ext: "" };
};

const MIT_LICENSE_TEXT = `MIT License

Copyright (c) 2026 https://github.com/SmoothBrainIT

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const emptyForm = {
  name: "",
  baseUrl: "",
  apiKey: "",
  tags: "",
};

const statusColor = (status: PrinterStatus | undefined) => {
  if (!status) return "#6f6a60";
  if (!status.online) return "#b24c32";
  if (status.state === "printing") return "#2f5cff";
  if (status.state === "ready" || status.state === "idle") return "#1a7f37";
  return "#f5c76b";
};

const statusLabel = (status: PrinterStatus | undefined) => {
  if (!status) return "Unknown";
  if (!status.online) return "Offline";
  return status.state;
};

const jobStatusColor = (status: string | undefined) => {
  if (!status) return "#6f6a60";
  if (status === "failed") return "#b24c32";
  if (status === "printing" || status === "uploaded") return "#2f5cff";
  if (status === "completed") return "#1a7f37";
  return "#f5c76b";
};

const statusSummary = (status: PrinterStatus | undefined, targetStatus: string | undefined) => {
  const isOnline = Boolean(status?.online);
  const statusState = status?.state;
  const rawState = statusState ?? targetStatus ?? "unknown";
  const resolvedState =
    rawState === "complete"
      ? "completed"
      : rawState === "error"
        ? "error"
        : rawState === "paused"
          ? "paused"
          : rawState;
  const isPrinting = resolvedState === "printing";
  const isReady =
    isPrinting || resolvedState === "ready" || resolvedState === "idle" || resolvedState === "standby";
  const primary = !isOnline
    ? "Offline"
    : resolvedState === "unknown"
      ? "Online"
      : resolvedState.charAt(0).toUpperCase() + resolvedState.slice(1);
  const readiness = isReady ? "Ready" : "Not Ready";
  const label = resolvedState === "ready" || resolvedState === "printing" ? primary : `${primary} - ${readiness}`;

  if (!isOnline) return { label, color: "#b24c32", isReady, isOnline };
  if (isPrinting) return { label, color: "#2f5cff", isReady, isOnline };
  if (resolvedState === "paused") return { label, color: "#f5c76b", isReady, isOnline };
  if (resolvedState === "error") return { label, color: "#b24c32", isReady, isOnline };
  if (resolvedState === "completed") return { label, color: "#1a7f37", isReady, isOnline };
  if (isReady) return { label, color: "#1a7f37", isReady, isOnline };
  return { label, color: "#f5c76b", isReady, isOnline };
};

const printerCardStyle = (
  statusEntry: PrinterStatus | undefined,
  targetStatus: string | undefined,
) => {
  const isOffline = !statusEntry || !statusEntry.online;
  const rawState = statusEntry?.state ?? targetStatus ?? "unknown";
  const resolvedState =
    rawState === "complete"
      ? "completed"
      : rawState === "error"
        ? "error"
        : rawState === "paused"
          ? "paused"
          : rawState;
  const isPrinting = resolvedState === "printing";
  const isReady =
    resolvedState === "ready" || resolvedState === "idle" || resolvedState === "standby";

  if (isPrinting) {
    return { border: "2px solid #2f5cff", background: "#f1f5ff", color: "#1d1c1a" };
  }
  if (resolvedState === "paused") {
    return { border: "2px solid #f5c76b", background: "#fff8ea", color: "#1d1c1a" };
  }
  if (resolvedState === "error") {
    return { border: "2px solid #b24c32", background: "#fff5f2", color: "#1d1c1a" };
  }
  if (resolvedState === "completed") {
    return { border: "2px solid #1a7f37", background: "#f4fbf6", color: "#1d1c1a" };
  }
  if (!isOffline && isReady) {
    return { border: "2px solid #1a7f37", background: "#f4fbf6", color: "#1d1c1a" };
  }
  return { border: "2px solid #b24c32", background: "#f7f7f7", color: "#8a8a8a" };
};

const sortItems = (items: PrinterDirectoryItem[], sortBy: string) => {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "dir" ? -1 : 1;
    }
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === "size") {
      return (b.size ?? 0) - (a.size ?? 0);
    }
    return (b.modified ?? 0) - (a.modified ?? 0);
  });
  return sorted;
};

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [printerStatus, setPrinterStatus] = useState<Record<number, PrinterStatus>>({});
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedPrinters, setSelectedPrinters] = useState<Record<number, boolean>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [printersLoaded, setPrintersLoaded] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [busyPrinters, setBusyPrinters] = useState<Record<number, boolean>>({});
  const [form, setForm] = useState(emptyForm);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [editingPrinterId, setEditingPrinterId] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyStatus, setApiKeyStatus] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [fileModalPrinter, setFileModalPrinter] = useState<Printer | null>(null);
  const [fileModalPath, setFileModalPath] = useState("gcodes");
  const [fileModalItems, setFileModalItems] = useState<PrinterDirectoryItem[]>([]);
  const [fileModalStatus, setFileModalStatus] = useState<string | null>(null);
  const [fileModalSearch, setFileModalSearch] = useState("");
  const [fileModalSort, setFileModalSort] = useState("modified");
  const [selectedItem, setSelectedItem] = useState<PrinterDirectoryItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [uiModal, setUiModal] = useState<{ printer: Printer; url: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [editUploads, setEditUploads] = useState(false);
  const [selectedUploadIds, setSelectedUploadIds] = useState<Record<number, boolean>>({});
  const [renamingJobId, setRenamingJobId] = useState<number | null>(null);
  const [renameJobValue, setRenameJobValue] = useState("");
  const [renameSavingId, setRenameSavingId] = useState<number | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [loadingAction, setLoadingAction] = useState<"upload" | "print" | null>(null);
  const [dispatchFeedback, setDispatchFeedback] = useState<{
    action: "upload" | "print";
    status: "success" | "error";
  } | null>(null);
  const [dispatchModal, setDispatchModal] = useState<{
    action: "upload" | "print";
    status: "sending" | "processing" | "success" | "error";
    jobId: number;
    printerIds: number[];
    message?: string;
  } | null>(null);

  const fetchJobs = useCallback(async () => {
    if (!jobsLoaded) {
      setLoadingJobs(true);
    }
    try {
      const jobsData = await api.listJobs();
      setJobs(jobsData);
      if (jobsData.length && selectedJobId === null) {
        setSelectedJobId(jobsData[0].id);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load jobs");
    } finally {
      setLoadingJobs(false);
      setJobsLoaded(true);
    }
  }, [jobsLoaded, selectedJobId]);

  const fetchPrinters = useCallback(async () => {
    if (!printersLoaded) {
      setLoadingPrinters(true);
    }
    try {
      const printersData = await api.listPrinters();
      setPrinters(printersData);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load printers");
    } finally {
      setLoadingPrinters(false);
      setPrintersLoaded(true);
    }
  }, [printersLoaded]);

  useEffect(() => {
    fetchJobs();
    fetchPrinters();
  }, [fetchJobs, fetchPrinters]);

  useEffect(() => {
    const interval = window.setInterval(fetchJobs, 5000);
    return () => window.clearInterval(interval);
  }, [fetchJobs]);

  useEffect(() => {
    let isMounted = true;
    const loadStatus = async () => {
      if (!statusLoaded) {
        setLoadingStatus(true);
      }
      try {
        const statuses = await api.listPrinterStatus();
        if (!isMounted) return;
        const map: Record<number, PrinterStatus> = {};
        statuses.forEach((entry) => {
          map[entry.id] = entry;
        });
        setPrinterStatus(map);
      } catch (error) {
        if (!isMounted) return;
        setStatus(error instanceof Error ? error.message : "Failed to fetch printer status");
      } finally {
        if (isMounted) {
          setLoadingStatus(false);
          setStatusLoaded(true);
        }
      }
    };

    loadStatus();
    const interval = window.setInterval(loadStatus, 10000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const response = await api.getApiKey();
        setApiKey(response.api_key);
      } catch (error) {
        setApiKeyStatus(error instanceof Error ? error.message : "Failed to load API key");
      }
    };

    loadApiKey();
  }, []);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  const togglePrinter = (printerId: number) => {
    setSelectedPrinters((prev) => ({ ...prev, [printerId]: !prev[printerId] }));
  };

  const handleDispatch = async (action: "upload" | "print") => {
    if (!selectedJob) {
      setStatus("Select a job first.");
      return;
    }

    const printerIds = Object.entries(selectedPrinters)
      .filter(([, selected]) => selected)
      .map(([id]) => Number(id));

    if (!printerIds.length) {
      setStatus("Select at least one printer.");
      return;
    }

    setLoading(true);
    setLoadingAction(action);
    setStatus(null);
    setDispatchModal({
      action,
      status: "sending",
      jobId: selectedJob.id,
      printerIds,
    });
    try {
      await api.dispatchJob(selectedJob.id, printerIds, action);
      setStatus(`Dispatching job #${selectedJob.id}...`);
      setDispatchModal((prev) => (prev ? { ...prev, status: "processing" } : prev));
      window.setTimeout(() => {
        setDispatchModal((prev) =>
          prev && prev.status === "processing" ? { ...prev, status: "success" } : prev,
        );
      }, 2500);
      setDispatchFeedback({ action, status: "success" });
      window.setTimeout(() => setDispatchFeedback(null), 1800);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Dispatch failed");
      setDispatchFeedback({ action, status: "error" });
      window.setTimeout(() => setDispatchFeedback(null), 2200);
      setDispatchModal((prev) =>
        prev
          ? {
              ...prev,
              status: "error",
              message: error instanceof Error ? error.message : "Dispatch failed",
            }
          : prev,
      );
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  };

  const toggleEditUploads = () => {
    setEditUploads((prev) => {
      if (prev) {
        setSelectedUploadIds({});
        setRenamingJobId(null);
        setRenameJobValue("");
      }
      return !prev;
    });
  };

  const toggleUploadSelection = (jobId: number) => {
    setSelectedUploadIds((prev) => ({ ...prev, [jobId]: !prev[jobId] }));
  };

  const selectAllUploads = () => {
    setSelectedUploadIds(() =>
      jobs.reduce<Record<number, boolean>>((acc, job) => {
        acc[job.id] = true;
        return acc;
      }, {}),
    );
  };

  const clearUploadSelection = () => {
    setSelectedUploadIds({});
  };

  const handleBulkDelete = async () => {
    const jobIds = Object.entries(selectedUploadIds)
      .filter(([, selected]) => selected)
      .map(([id]) => Number(id));
    if (!jobIds.length) {
      setStatus("Select uploads to delete.");
      return;
    }
    const confirmed = window.confirm(
      `Delete ${jobIds.length} upload${jobIds.length === 1 ? "" : "s"}? This cannot be undone.`,
    );
    if (!confirmed) return;
    setStatus(null);
    setDeleteBusy(true);
    try {
      await api.deleteJobs(jobIds);
      setJobs((prev) => {
        const next = prev.filter((job) => !jobIds.includes(job.id));
        setSelectedJobId((current) => (current && jobIds.includes(current) ? next[0]?.id ?? null : current));
        return next;
      });
      setSelectedUploadIds({});
      setRenamingJobId(null);
      setRenameJobValue("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to delete uploads");
    } finally {
      setDeleteBusy(false);
    }
  };

  const startRenameJob = (job: Job) => {
    setRenamingJobId(job.id);
    setRenameJobValue(stripExtension(job.file.original_filename));
  };

  const cancelRenameJob = () => {
    setRenamingJobId(null);
    setRenameJobValue("");
  };

  const handleRenameJob = async (jobId: number) => {
    if (!renameJobValue.trim()) {
      setStatus("Filename cannot be empty.");
      return;
    }
    const job = jobs.find((entry) => entry.id === jobId);
    const currentName = job?.file.original_filename ?? "";
    const { ext } = splitExtension(currentName);
    const inputValue = renameJobValue.trim();
    const baseFromInput = ext && inputValue.toLowerCase().endsWith(ext.toLowerCase())
      ? inputValue.slice(0, -ext.length)
      : stripExtension(inputValue);
    const nextName = `${baseFromInput}${ext}`;
    setStatus(null);
    setRenameSavingId(jobId);
    try {
      const updated = await api.renameJobFile(jobId, nextName);
      setJobs((prev) => prev.map((job) => (job.id === jobId ? updated : job)));
      setRenamingJobId(null);
      setRenameJobValue("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to rename file");
    } finally {
      setRenameSavingId(null);
    }
  };
  const handleAddPrinter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormStatus(null);

    if (!form.name.trim() || !form.baseUrl.trim()) {
      setFormStatus("Name and base URL are required.");
      return;
    }

    try {
      const created = await api.createPrinter({
        name: form.name.trim(),
        base_url: form.baseUrl.trim(),
        api_key: form.apiKey.trim() || null,
        tags: form.tags.trim() || null,
        enabled: true,
      });
      setPrinters((prev) => [created, ...prev]);
      setForm(emptyForm);
      setFormStatus("Printer added.");
    } catch (error) {
      setFormStatus(error instanceof Error ? error.message : "Failed to add printer");
    }
  };

  const handleEditPrinter = (printer: Printer) => {
    setEditingPrinterId(printer.id);
    setForm({
      name: printer.name,
      baseUrl: printer.base_url,
      apiKey: "",
      tags: printer.tags ?? "",
    });
    setFormStatus("Editing printer. Leave API key blank to keep current.");
  };

  const handleUpdatePrinter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingPrinterId) return;

    if (!form.name.trim() || !form.baseUrl.trim()) {
      setFormStatus("Name and base URL are required.");
      return;
    }

    try {
      const payload = {
        name: form.name.trim(),
        base_url: form.baseUrl.trim(),
        tags: form.tags.trim() || null,
        api_key: form.apiKey.trim() || null,
      };
      const updated = await api.updatePrinter(editingPrinterId, payload);
      setPrinters((prev) => prev.map((printer) => (printer.id === updated.id ? updated : printer)));
      setEditingPrinterId(null);
      setForm(emptyForm);
      setFormStatus("Printer updated.");
    } catch (error) {
      setFormStatus(error instanceof Error ? error.message : "Failed to update printer");
    }
  };

  const handleCancelEdit = () => {
    setEditingPrinterId(null);
    setForm(emptyForm);
    setFormStatus(null);
  };

  const handleDeletePrinter = async (printerId: number) => {
    setFormStatus(null);
    try {
      await api.deletePrinter(printerId);
      setPrinters((prev) => prev.filter((printer) => printer.id !== printerId));
      setFormStatus("Printer deleted.");
    } catch (error) {
      setFormStatus(error instanceof Error ? error.message : "Failed to delete printer");
    }
  };

  const handleTestPrinter = async (printerId: number) => {
    setStatus(null);
    setBusyPrinters((prev) => ({ ...prev, [printerId]: true }));
    try {
      const result = await api.testPrinter(printerId);
      setPrinterStatus((prev) => ({ ...prev, [printerId]: result }));
      setStatus(result.online ? "Printer online." : "Printer offline.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to test printer");
    } finally {
      setBusyPrinters((prev) => ({ ...prev, [printerId]: false }));
    }
  };
  const loadDirectory = async (printer: Printer, path: string) => {
    setFileModalStatus("Loading files...");
    try {
      const result = await api.listPrinterDirectory(printer.id, path);
      setFileModalItems(result.items);
      setFileModalPath(result.path);
      setSelectedItem(null);
      setRenameValue("");
      setFileModalStatus(null);
    } catch (error) {
      setFileModalStatus(error instanceof Error ? error.message : "Failed to load files");
    }
  };

  const openFileModal = async (printer: Printer) => {
    setFileModalPrinter(printer);
    setFileModalSearch("");
    setFileModalSort("modified");
    await loadDirectory(printer, "gcodes");
  };

  const closeFileModal = () => {
    setFileModalPrinter(null);
    setFileModalItems([]);
    setFileModalSearch("");
    setFileModalSort("modified");
    setFileModalPath("gcodes");
    setSelectedItem(null);
    setRenameValue("");
    setFileModalStatus(null);
  };

  const handlePrintFile = async () => {
    if (!fileModalPrinter || !selectedItem || selectedItem.type !== "file") return;
    setFileModalStatus("Starting print...");
    try {
      await api.printPrinterFile(fileModalPrinter.id, selectedItem.path);
      setFileModalStatus("Print started.");
    } catch (error) {
      setFileModalStatus(error instanceof Error ? error.message : "Failed to start print");
    }
  };

  const handleDeletePath = async () => {
    if (!fileModalPrinter || !selectedItem) return;
    setFileModalStatus("Deleting...");
    try {
      await api.deletePrinterPath(fileModalPrinter.id, selectedItem.path, selectedItem.type);
      await loadDirectory(fileModalPrinter, fileModalPath);
    } catch (error) {
      setFileModalStatus(error instanceof Error ? error.message : "Failed to delete");
    }
  };

  const handleRenamePath = async () => {
    if (!fileModalPrinter || !selectedItem || !renameValue.trim()) return;
    const basePath = fileModalPath.replace(/\/$/, "");
    const dest = `${basePath}/${renameValue.trim()}`;
    setFileModalStatus("Renaming...");
    try {
      await api.movePrinterPath(fileModalPrinter.id, selectedItem.path, dest);
      await loadDirectory(fileModalPrinter, fileModalPath);
      setRenameValue("");
    } catch (error) {
      setFileModalStatus(error instanceof Error ? error.message : "Failed to rename");
    }
  };

  const handleRotateApiKey = async () => {
    setApiKeyStatus(null);
    try {
      const response = await api.rotateApiKey();
      setApiKey(response.api_key);
      setShowApiKey(true);
      setApiKeyStatus("API key rotated. Update slicers with the new key.");
    } catch (error) {
      setApiKeyStatus(error instanceof Error ? error.message : "Failed to rotate API key");
    }
  };

  const handleCopyApiKey = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setApiKeyStatus("API key copied.");
    } catch (error) {
      setApiKeyStatus(error instanceof Error ? error.message : "Failed to copy API key");
    }
  };

  const filteredItems = useMemo(() => {
    const search = fileModalSearch.trim().toLowerCase();
    const filtered = search
      ? fileModalItems.filter((item) => item.path.toLowerCase().includes(search))
      : fileModalItems;
    return sortItems(filtered, fileModalSort);
  }, [fileModalItems, fileModalSearch, fileModalSort]);

  const breadcrumbSegments = useMemo(() => {
    const segments = fileModalPath.split("/").filter(Boolean);
    return segments.length ? segments : ["gcodes"];
  }, [fileModalPath]);

  const parentPath = useMemo(() => {
    if (breadcrumbSegments.length <= 1) {
      return "gcodes";
    }
    return breadcrumbSegments.slice(0, -1).join("/");
  }, [breadcrumbSegments]);

  const printerById = useMemo(() => {
    const map: Record<number, Printer> = {};
    printers.forEach((printer) => {
      map[printer.id] = printer;
    });
    return map;
  }, [printers]);

  const isPrinting = useMemo(() => {
    return Boolean(selectedJob?.targets.some((target) => target.status === "printing"));
  }, [selectedJob]);

  const uploadFeedback = dispatchFeedback?.action === "upload" ? dispatchFeedback.status : null;
  const printFeedback = dispatchFeedback?.action === "print" ? dispatchFeedback.status : null;
  const printerCards = printers.map((printer) => {
    const statusEntry = printerStatus[printer.id];
    const targetStatus = selectedJob?.targets.find((target) => target.printer_id === printer.id)?.status;
    const summary = statusSummary(statusEntry, targetStatus);
    const cardStyle = printerCardStyle(statusEntry, targetStatus);
    const uiLink = statusEntry?.web_uis?.[0]?.url ?? null;
    const isClickable = Boolean(summary.isOnline && uiLink);
    const isPrinting = statusEntry?.state === "printing";
    let detailLine = statusEntry?.state_message ?? "";
    if (isPrinting) {
      const progress = statusEntry?.progress ?? null;
      const printDuration = statusEntry?.print_duration ?? null;
      const totalDuration = statusEntry?.total_duration ?? null;
      let etaSeconds: number | null = null;
      if (typeof totalDuration === "number" && typeof printDuration === "number") {
        etaSeconds = totalDuration - printDuration;
      } else if (typeof progress === "number" && typeof printDuration === "number" && progress > 0.01) {
        etaSeconds = printDuration * (1 / progress - 1);
      }
      const layerInfo =
        typeof statusEntry?.current_layer === "number" && typeof statusEntry?.total_layers === "number"
          ? `${statusEntry.current_layer}/${statusEntry.total_layers}`
          : null;
      const etaInfo = etaSeconds !== null ? formatDurationShort(etaSeconds) : null;
      const computed = [etaInfo, layerInfo].filter(Boolean).join(" | ");
      detailLine = computed || detailLine;
    }
    return (
      <div
        key={printer.id}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={() => {
          if (isClickable && uiLink) {
            setUiModal({ printer, url: uiLink });
          }
        }}
        onKeyDown={(event) => {
          if (!isClickable || !uiLink) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setUiModal({ printer, url: uiLink });
          }
        }}
        style={{
          borderRadius: "16px",
          padding: "0.85rem 1rem",
          minWidth: "220px",
          background: cardStyle.background,
          border: cardStyle.border,
          color: cardStyle.color,
          opacity: statusEntry?.online ? 1 : 0.7,
          display: "flex",
          flexDirection: "column",
          gap: "0.35rem",
          position: "relative",
          cursor: isClickable ? "pointer" : "default",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "0.65rem",
            right: "0.7rem",
            width: "22px",
            height: "22px",
            borderRadius: "999px",
            border: `2px solid ${summary.isReady ? "#1a7f37" : "#b24c32"}`,
            color: summary.isReady ? "#1a7f37" : "#b24c32",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.8rem",
            fontWeight: 700,
            background: "#ffffff",
          }}
          aria-label={summary.isReady ? "Ready" : "Not ready"}
          title={summary.isReady ? "Ready" : "Not ready"}
        >
          {summary.isReady ? "✓" : "×"}
        </div>
        <div style={{ fontWeight: 600 }}>{printer.name}</div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            fontSize: "0.85rem",
            color: summary.color,
            fontWeight: 600,
          }}
        >
          {summary.label}
        </div>
        {detailLine && <div style={{ fontSize: "0.8rem" }}>{detailLine}</div>}
      </div>
    );
  });

  useEffect(() => {
    if (!dispatchModal || dispatchModal.status === "success" || dispatchModal.status === "error") {
      return;
    }
    if (!selectedJob) return;
    const relevantTargets = selectedJob.targets.filter((target) =>
      dispatchModal.printerIds.includes(target.printer_id),
    );
    if (relevantTargets.some((target) => ["uploaded", "printing", "completed"].includes(target.status))) {
      setDispatchModal((prev) => (prev ? { ...prev, status: "success" } : prev));
    }
  }, [dispatchModal, selectedJob]);

  useEffect(() => {
    if (!dispatchModal || dispatchModal.status !== "success") return;
    const timer = window.setTimeout(() => setDispatchModal(null), 1400);
    return () => window.clearTimeout(timer);
  }, [dispatchModal]);

  return (
    <>
      <style>
        {`
          @keyframes shimmer {
            0% { background-position: -300px 0; }
            100% { background-position: 300px 0; }
          }
          .skeleton {
            background: linear-gradient(90deg, #f1efe9 25%, #f8f6f2 50%, #f1efe9 75%);
            background-size: 600px 100%;
            animation: shimmer 1.4s ease infinite;
          }
          .skeleton-dark {
            background: linear-gradient(90deg, #1d1f2d 25%, #26293a 50%, #1d1f2d 75%);
            background-size: 600px 100%;
            animation: shimmer 1.4s ease infinite;
          }
          .spin {
            border: 2px solid rgba(255,255,255,0.25);
            border-top-color: rgba(255,255,255,0.85);
            border-radius: 50%;
            width: 14px;
            height: 14px;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <div>
        <div
          style={{
            minHeight: "100vh",
            background: "radial-gradient(circle at top, #f0f3ff, #f8f4f0)",
            color: "#1d1c1a",
            padding: "2rem",
          }}
        >
          <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <img
                src={logoUrl}
                alt="PrintMux"
                style={{ height: "56px", width: "auto", objectFit: "contain" }}
              />
              {/* <div>
                <h1 style={{ fontSize: "2.4rem", marginBottom: "0.35rem" }}>PrintMux</h1>
              <p style={{ margin: 0, color: "#5a564f" }}>
                Upload once, dispatch to many.
              </p>
              </div> */}
            </div>
            <div style={{ textAlign: "right", color: "#5a564f", fontSize: "0.9rem" }}>
              <div>Jobs: {jobs.length}</div>
              <div>Printers: {printers.length}</div>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                style={{
                  marginTop: "0.6rem",
                  padding: "0.45rem 0.7rem",
                  borderRadius: "999px",
                  border: "1px solid #e0dedb",
                  background: "#fff",
                  color: "#1d1c1a",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                Settings
              </button>
            </div>
          </header>

          <section
            className="card-rise"
            style={{
              marginTop: "2rem",
              background: "#ffffff",
              borderRadius: "20px",
              padding: "1.25rem 1.5rem",
              boxShadow: "0 20px 50px rgba(20, 20, 20, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ marginTop: 0, marginBottom: "0.35rem" }}>Per-printer Status</h2>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "#6f6a60" }}>
                At-a-glance health for the fleet.
                {loadingStatus && statusLoaded && (
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "999px",
                      border: "2px solid rgba(90, 86, 79, 0.35)",
                      borderTopColor: "#5a564f",
                      display: "inline-block",
                      animation: "spin 0.8s linear infinite",
                    }}
                    aria-label="Refreshing status"
                    title="Refreshing status"
                  />
                )}
              </div>
            </div>
            {loadingPrinters && !printersLoaded ? (
              <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap" }}>
                {[0, 1, 2].map((index) => (
                  <div
                    key={`status-skel-${index}`}
                    className="skeleton"
                    style={{
                      borderRadius: "16px",
                      padding: "0.85rem 1rem",
                      minWidth: "220px",
                      height: "88px",
                    }}
                  />
                ))}
              </div>
            ) : printers.length === 0 ? (
              <p style={{ color: "#6f6a60", margin: 0 }}>No printers yet.</p>
            ) : !statusLoaded ? (
              <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap" }}>
                {printers.map((printer) => (
                  <div
                    key={`status-skel-${printer.id}`}
                    className="skeleton"
                    style={{
                      borderRadius: "16px",
                      padding: "0.85rem 1rem",
                      minWidth: "220px",
                      height: "88px",
                    }}
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap" }}>{printerCards}</div>
            )}
          </section>

          <section
            className="card-rise"
            style={{
              marginTop: "2rem",
              display: "grid",
              gridTemplateColumns: "1.2fr 0.8fr",
              gap: "1.5rem",
            }}
          >
            <div
              className="card-rise"
              style={{
                background: "#ffffff",
                borderRadius: "20px",
                padding: "1.5rem",
                boxShadow: "0 20px 50px rgba(20, 20, 20, 0.1)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ marginTop: 0 }}>Uploads</h2>
                <button
                  type="button"
                  onClick={toggleEditUploads}
                  style={{
                    padding: "0.35rem 0.7rem",
                    borderRadius: "999px",
                    border: "1px solid #e0dedb",
                    background: editUploads ? "#1d1c1a" : "#fff",
                    color: editUploads ? "#fff" : "#1d1c1a",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                  }}
                >
                  {editUploads ? "Done" : "Edit"}
                </button>
              </div>
              {editUploads && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "12px",
                    background: "#f8f4f0",
                    marginBottom: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "0.85rem", color: "#6f6a60" }}>
                      Selected: {Object.values(selectedUploadIds).filter(Boolean).length}
                    </div>
                    <button
                      type="button"
                      onClick={selectAllUploads}
                      style={{
                        padding: "0.25rem 0.6rem",
                        borderRadius: "999px",
                        border: "1px solid #e0dedb",
                        background: "#fff",
                        color: "#1d1c1a",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                      }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={clearUploadSelection}
                      style={{
                        padding: "0.25rem 0.6rem",
                        borderRadius: "999px",
                        border: "1px solid #e0dedb",
                        background: "#fff",
                        color: "#1d1c1a",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                      }}
                    >
                      Select None
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    style={{
                      padding: "0.35rem 0.7rem",
                      borderRadius: "999px",
                      border: "1px solid #f2d1cb",
                      background: "#fff5f2",
                      color: "#b24c32",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                    }}
                    disabled={deleteBusy}
                  >
                    {deleteBusy ? (
                      <>
                        <span
                          style={{
                            width: "12px",
                            height: "12px",
                            borderRadius: "999px",
                            border: "2px solid rgba(178, 76, 50, 0.35)",
                            borderTopColor: "#b24c32",
                            display: "inline-block",
                            animation: "spin 0.8s linear infinite",
                          }}
                        />
                        Deleting
                      </>
                    ) : (
                      "Delete Selected"
                    )}
                  </button>
                </div>
              )}
              {jobs.length === 0 ? (
                loadingJobs && !jobsLoaded ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {[0, 1, 2].map((index) => (
                      <div
                        key={`upload-skel-${index}`}
                        className="skeleton"
                        style={{ borderRadius: "14px", height: "78px" }}
                      />
                    ))}
                  </div>
                ) : (
                  <p>No uploads yet. Upload from your slicer to populate.</p>
                )
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {jobs.map((job, index) => {
                    const isSelected = job.id === selectedJobId;
                    const isRenaming = renamingJobId === job.id;
                    return (
                      <div
                        key={job.id}
                        role="button"
                        tabIndex={editUploads ? -1 : 0}
                        onClick={() => {
                          if (!editUploads) {
                            setSelectedJobId(job.id);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (editUploads) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedJobId(job.id);
                          }
                        }}
                        style={{
                          border: isSelected ? "2px solid #2f5cff" : "1px solid #e0dedb",
                          borderRadius: "14px",
                          padding: "1rem",
                          textAlign: "left",
                          background: isSelected ? "#eef2ff" : "#fff",
                          cursor: editUploads ? "default" : "pointer",
                        }}
                      >
                        {editUploads && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginBottom: "0.5rem",
                            }}
                          >
                            <label
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.4rem",
                                fontSize: "0.8rem",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(selectedUploadIds[job.id])}
                                onClick={(event) => event.stopPropagation()}
                                onChange={() => toggleUploadSelection(job.id)}
                              />
                              Select
                            </label>
                          </div>
                        )}
                        <div style={{ fontSize: "0.85rem", color: "#6f6a60" }}>
                          {index === 0 ? "Most recent" : "Job"} #{job.id}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "0.5rem",
                          }}
                        >
                          <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                            {job.file.original_filename}
                          </div>
                          {editUploads && !isRenaming && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                startRenameJob(job);
                              }}
                              style={{
                                padding: "0.3rem 0.5rem",
                                borderRadius: "999px",
                                border: "1px solid #e0dedb",
                                background: "#fff",
                                color: "#1d1c1a",
                                cursor: "pointer",
                                fontSize: "0.75rem",
                              }}
                            >
                              ✎
                            </button>
                          )}
                        </div>
                        {isRenaming && (
                          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                flex: 1,
                                minWidth: "220px",
                              }}
                            >
                              <input
                                type="text"
                                value={renameJobValue}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => setRenameJobValue(event.target.value)}
                                style={{
                                  flex: 1,
                                  padding: "0.45rem 0.6rem",
                                  borderRadius: "8px",
                                  border: "1px solid #e0dedb",
                                }}
                              />
                              {splitExtension(job.file.original_filename).ext && (
                                <span
                                  style={{
                                    padding: "0.35rem 0.6rem",
                                    borderRadius: "999px",
                                    border: "1px solid #e0dedb",
                                    background: "#f8f4f0",
                                    color: "#6f6a60",
                                    fontSize: "0.8rem",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {splitExtension(job.file.original_filename).ext}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRenameJob(job.id);
                              }}
                              style={{
                                padding: "0.4rem 0.7rem",
                                borderRadius: "8px",
                                border: "none",
                                background: "#2f5cff",
                                color: "#fff",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                              }}
                              disabled={renameSavingId === job.id}
                            >
                              {renameSavingId === job.id ? (
                                <>
                                  <span
                                    style={{
                                      width: "12px",
                                      height: "12px",
                                      borderRadius: "999px",
                                      border: "2px solid rgba(255, 255, 255, 0.5)",
                                      borderTopColor: "#fff",
                                      display: "inline-block",
                                      animation: "spin 0.8s linear infinite",
                                    }}
                                  />
                                  Saving
                                </>
                              ) : (
                                "Save"
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                cancelRenameJob();
                              }}
                              style={{
                                padding: "0.4rem 0.7rem",
                                borderRadius: "8px",
                                border: "1px solid #e0dedb",
                                background: "#fff",
                                cursor: "pointer",
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        <div style={{ fontSize: "0.9rem", color: "#5a564f" }}>
                          {formatBytes(job.file.size)} · {formatTime(job.created_at)}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#6f6a60" }}>
                          Status: {job.status} · Action: {job.requested_action}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              className="card-rise-delay"
              style={{
                background: "#11121a",
                color: "#fef7ee",
                borderRadius: "20px",
                padding: "1.5rem",
                boxShadow: "0 20px 50px rgba(20, 20, 20, 0.12)",
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
              }}
            >
              <div>
                <h2 style={{ marginTop: 0 }}>Dispatch</h2>
                <p style={{ color: "#c8c1b4", marginTop: "0.5rem" }}>
                  Select printers for job #{selectedJob?.id ?? "-"}.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {loadingPrinters && !printersLoaded ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    {[0, 1, 2].map((index) => (
                      <div
                        key={`dispatch-skel-${index}`}
                        className="skeleton-dark"
                        style={{ borderRadius: "12px", height: "54px" }}
                      />
                    ))}
                  </div>
                ) : !statusLoaded ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    {printers.map((printer) => (
                      <div
                        key={`dispatch-skel-${printer.id}`}
                        className="skeleton-dark"
                        style={{ borderRadius: "12px", height: "54px" }}
                      />
                    ))}
                  </div>
                ) : printers.length === 0 ? (
                  <p style={{ color: "#c8c1b4" }}>Add printers in the backend to start dispatching.</p>
                ) : (
                  printers.map((printer) => {
                    const statusEntry = printerStatus[printer.id];
                    const targetStatus = selectedJob?.targets.find(
                      (target) => target.printer_id === printer.id
                    )?.status;
                    const summary = statusSummary(statusEntry, targetStatus);
                    const printerIsPrinting = statusEntry?.state === "printing";
                    return (
                      <label
                        key={printer.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.75rem 1rem",
                          borderRadius: "12px",
                          background: printer.enabled ? "#1b1c27" : "#2b2c3a",
                          border: "1px solid #2b2c3a",
                          opacity: printerIsPrinting ? 0.6 : 1,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{printer.name}</div>
                          <div style={{ fontSize: "0.8rem", color: summary.color }}>
                            {summary.label}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(selectedPrinters[printer.id])}
                          onChange={() => togglePrinter(printer.id)}
                          disabled={!printer.enabled || printerIsPrinting}
                        />
                      </label>
                    );
                  })
                )}
              </div>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  onClick={() => handleDispatch("upload")}
                  disabled={loadingAction !== null}
                  style={{
                    flex: 1,
                    padding: "0.85rem 1rem",
                    borderRadius: "999px",
                    border: "none",
                    background:
                      uploadFeedback === "success"
                        ? "#1a7f37"
                        : uploadFeedback === "error"
                          ? "#b24c32"
                          : "#f5c76b",
                    color: uploadFeedback ? "#fff" : "#1d1c1a",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.4rem",
                  }}
                >
                  {loadingAction === "upload" ? (
                    <>
                      <span
                        style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "999px",
                          border: "2px solid rgba(29, 28, 26, 0.35)",
                          borderTopColor: "#1d1c1a",
                          display: "inline-block",
                          animation: "spin 0.8s linear infinite",
                        }}
                      />
                      Uploading
                    </>
                  ) : uploadFeedback === "success" ? (
                    <>
                      <span>✓</span>
                      Success
                    </>
                  ) : uploadFeedback === "error" ? (
                    <>
                      <span>×</span>
                      Failed
                    </>
                  ) : (
                    "Upload Only"
                  )}
                </button>
                <button
                  onClick={() => handleDispatch("print")}
                  disabled={loadingAction !== null}
                  style={{
                    flex: 1,
                    padding: "0.85rem 1rem",
                    borderRadius: "999px",
                    border: "none",
                    background:
                      printFeedback === "success"
                        ? "#1a7f37"
                        : printFeedback === "error"
                          ? "#b24c32"
                          : "#2f5cff",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.4rem",
                  }}
                >
                  {loadingAction === "print" ? (
                    <>
                      <span
                        style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "999px",
                          border: "2px solid rgba(255, 255, 255, 0.4)",
                          borderTopColor: "#fff",
                          display: "inline-block",
                          animation: "spin 0.8s linear infinite",
                        }}
                      />
                      Dispatching
                    </>
                  ) : printFeedback === "success" ? (
                    <>
                      <span>✓</span>
                      Success
                    </>
                  ) : printFeedback === "error" ? (
                    <>
                      <span>×</span>
                      Failed
                    </>
                  ) : (
                    "Upload and Print"
                  )}
                </button>
              </div>

              {status && <div style={{ fontSize: "0.9rem", color: "#f5c76b" }}>{status}</div>}
            </div>
          </section>

          <footer
            style={{
              marginTop: "2.5rem",
              paddingBottom: "1rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "center",
              justifyContent: "space-between",
              color: "#6f6a60",
              fontSize: "0.85rem",
            }}
          >
            <div>© 2026 PrintMux. All rights reserved.</div>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              <a
                href="https://github.com/SmoothBrainIT/PrintMux"
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#2f5cff",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                GitHub
              </a>
              <button
                type="button"
                onClick={() => setLicenseOpen(true)}
                style={{
                  border: "1px solid #e0dedb",
                  background: "#fff",
                  color: "#1d1c1a",
                  borderRadius: "999px",
                  padding: "0.3rem 0.7rem",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                }}
              >
                License
              </button>
            </div>
          </footer>

          {licenseOpen && (
            <div
              onClick={() => setLicenseOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 16, 24, 0.55)",
                backdropFilter: "blur(6px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2rem",
                zIndex: 30,
              }}
            >
              <div
                onClick={(event) => event.stopPropagation()}
                style={{
                  background: "#ffffff",
                  borderRadius: "20px",
                  padding: "1.5rem",
                  width: "min(760px, 100%)",
                  maxHeight: "85vh",
                  overflow: "auto",
                  boxShadow: "0 30px 70px rgba(20, 20, 20, 0.3)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ marginTop: 0 }}>License</h2>
                  <button
                    type="button"
                    onClick={() => setLicenseOpen(false)}
                    style={{
                      border: "none",
                      background: "#f2f2f2",
                      borderRadius: "999px",
                      padding: "0.35rem 0.7rem",
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </div>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "monospace",
                    fontSize: "0.85rem",
                    color: "#1d1c1a",
                    background: "#f8f7f5",
                    padding: "1rem",
                    borderRadius: "12px",
                    border: "1px solid #e0dedb",
                  }}
                >
                  {MIT_LICENSE_TEXT}
                </pre>
              </div>
            </div>
          )}
          {dispatchModal && (
            <div
              onClick={() => setDispatchModal(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 16, 24, 0.55)",
                backdropFilter: "blur(6px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2rem",
                zIndex: 35,
              }}
            >
              <div
                onClick={(event) => event.stopPropagation()}
                style={{
                  background: "#ffffff",
                  borderRadius: "20px",
                  padding: "1.5rem",
                  width: "min(520px, 100%)",
                  boxShadow: "0 30px 70px rgba(20, 20, 20, 0.3)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>Dispatch Status</h2>
                    <div style={{ fontSize: "0.85rem", color: "#6f6a60" }}>
                      Job #{dispatchModal.jobId} · {dispatchModal.action === "print" ? "Print" : "Upload"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDispatchModal(null)}
                    style={{
                      border: "none",
                      background: "#f2f2f2",
                      borderRadius: "999px",
                      padding: "0.35rem 0.7rem",
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "14px",
                    background: "#f8f4f0",
                  }}
                >
                  {dispatchModal.status === "sending" || dispatchModal.status === "processing" ? (
                    <span
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "999px",
                        border: "2px solid rgba(47, 92, 255, 0.25)",
                        borderTopColor: "#2f5cff",
                        display: "inline-block",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                  ) : dispatchModal.status === "success" ? (
                    <span
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "999px",
                        border: "2px solid #1a7f37",
                        color: "#1a7f37",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.9rem",
                        fontWeight: 700,
                        background: "#ffffff",
                      }}
                    >
                      ✓
                    </span>
                  ) : (
                    <span
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "999px",
                        border: "2px solid #b24c32",
                        color: "#b24c32",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.9rem",
                        fontWeight: 700,
                        background: "#ffffff",
                      }}
                    >
                      ×
                    </span>
                  )}
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {dispatchModal.status === "sending"
                        ? "Sending to printers..."
                        : dispatchModal.status === "processing"
                          ? "Processing and waiting for confirmation..."
                          : dispatchModal.status === "success"
                            ? "Success — printers acknowledged."
                            : "Dispatch failed."}
                    </div>
                    {dispatchModal.message && (
                      <div style={{ fontSize: "0.85rem", color: "#6f6a60" }}>{dispatchModal.message}</div>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: "0.85rem", color: "#6f6a60" }}>
                  Targets:{" "}
                  {dispatchModal.printerIds
                    .map((id) => printerById[id]?.name ?? `Printer #${id}`)
                    .join(", ")}
                </div>
              </div>
            </div>
          )}
          {fileModalPrinter && (
            <div
              onClick={closeFileModal}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 16, 24, 0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2rem",
                zIndex: 20,
              }}
            >
              <div
                onClick={(event) => event.stopPropagation()}
                style={{
                  background: "#ffffff",
                  borderRadius: "20px",
                  padding: "1.5rem",
                  width: "min(760px, 100%)",
                  boxShadow: "0 30px 70px rgba(20, 20, 20, 0.3)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h2 style={{ marginTop: 0 }}>Files on {fileModalPrinter.name}</h2>
                    <p style={{ marginTop: "0.25rem", color: "#6f6a60" }}>
                      Browse and print files already stored on the device.
                    </p>
                    <div style={{ fontSize: "0.85rem", color: "#6f6a60" }}>
                      Path: {fileModalPath}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeFileModal}
                    style={{
                      border: "none",
                      background: "#f2f2f2",
                      borderRadius: "999px",
                      padding: "0.35rem 0.7rem",
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                  {breadcrumbSegments.map((segment, index) => {
                    const path = breadcrumbSegments.slice(0, index + 1).join("/");
                    return (
                      <button
                        key={path}
                        type="button"
                        onClick={() => fileModalPrinter && loadDirectory(fileModalPrinter, path)}
                        style={{
                          padding: "0.35rem 0.6rem",
                          borderRadius: "999px",
                          border: "1px solid #e0dedb",
                          background: "#fff",
                          color: "#1d1c1a",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                        }}
                      >
                        {segment}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
                  <button
                    type="button"
                    onClick={() => fileModalPrinter && loadDirectory(fileModalPrinter, parentPath)}
                    disabled={fileModalPath === "gcodes"}
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: "10px",
                      border: "1px solid #e0dedb",
                      background: fileModalPath === "gcodes" ? "#f2f2f2" : "#fff",
                      color: "#1d1c1a",
                      cursor: fileModalPath === "gcodes" ? "not-allowed" : "pointer",
                    }}
                  >
                    Up
                  </button>
                  <input
                    type="text"
                    placeholder="Search files"
                    value={fileModalSearch}
                    onChange={(event) => setFileModalSearch(event.target.value)}
                    style={{
                      flex: 1,
                      minWidth: "200px",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "10px",
                      border: "1px solid #e0dedb",
                    }}
                  />
                  <select
                    value={fileModalSort}
                    onChange={(event) => setFileModalSort(event.target.value)}
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: "10px",
                      border: "1px solid #e0dedb",
                    }}
                  >
                    <option value="modified">Sort: Recent</option>
                    <option value="name">Sort: Name</option>
                    <option value="size">Sort: Size</option>
                  </select>
                  <button
                    type="button"
                    onClick={handlePrintFile}
                    disabled={!selectedItem || selectedItem.type !== "file"}
                    style={{
                      padding: "0.5rem 0.9rem",
                      borderRadius: "10px",
                      border: "none",
                      background: selectedItem && selectedItem.type === "file" ? "#2f5cff" : "#c9d2ff",
                      color: "#fff",
                      cursor: selectedItem && selectedItem.type === "file" ? "pointer" : "not-allowed",
                    }}
                  >
                    Print Selected
                  </button>
                </div>

                {selectedItem && (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.6rem 0.75rem",
                      borderRadius: "10px",
                      border: "1px solid #e0dedb",
                      background: "#f8f7f5",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontSize: "0.85rem", color: "#5a564f" }}>
                      Selected: <strong>{selectedItem.name}</strong>
                    </div>
                    <input
                      type="text"
                      placeholder="Rename to..."
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      style={{
                        flex: 1,
                        minWidth: "160px",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "8px",
                        border: "1px solid #e0dedb",
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleRenamePath}
                      disabled={!renameValue.trim()}
                      style={{
                        padding: "0.4rem 0.7rem",
                        borderRadius: "8px",
                        border: "1px solid #e0dedb",
                        background: "#fff",
                        cursor: renameValue.trim() ? "pointer" : "not-allowed",
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={handleDeletePath}
                      style={{
                        padding: "0.4rem 0.7rem",
                        borderRadius: "8px",
                        border: "1px solid #f2d1cb",
                        background: "#fff5f2",
                        color: "#b24c32",
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}

                <div style={{ marginTop: "1rem", maxHeight: "320px", overflow: "auto" }}>
                  {fileModalStatus && (
                    <div style={{ color: "#5a564f", marginBottom: "0.5rem" }}>{fileModalStatus}</div>
                  )}
                  {filteredItems.length === 0 ? (
                    <div style={{ color: "#6f6a60" }}>No files found.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {filteredItems.map((item) => {
                        const isSelected = selectedItem?.path === item.path;
                        return (
                          <button
                            key={item.path}
                            onClick={() => {
                              setSelectedItem(item);
                              setRenameValue(item.name);
                            }}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "0.6rem 0.75rem",
                              borderRadius: "10px",
                              border: isSelected ? "2px solid #2f5cff" : "1px solid #e0dedb",
                              background: isSelected ? "#eef2ff" : "#fff",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600 }}>
                                {item.type === "dir" ? "[DIR]" : "[FILE]"}{" "}
                                {item.name || item.path.replace(/\/$/, "").split("/").pop() || item.path}
                              </div>
                              <div style={{ fontSize: "0.8rem", color: "#6f6a60" }}>
                                {item.size ? formatBytes(item.size) : "—"} ·{" "}
                                {item.modified ? new Date(item.modified * 1000).toLocaleString() : "—"}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                              {item.type === "dir" && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (fileModalPrinter) {
                                      loadDirectory(fileModalPrinter, item.path);
                                    }
                                  }}
                                  style={{
                                    padding: "0.3rem 0.6rem",
                                    borderRadius: "999px",
                                    border: "1px solid #e0dedb",
                                    background: "#fff",
                                    cursor: "pointer",
                                    fontSize: "0.75rem",
                                  }}
                                >
                                  Open
                                </button>
                              )}
                              <div style={{ fontSize: "0.75rem", color: "#6f6a60" }}>
                                {item.permissions ?? ""}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {settingsOpen && (
            <div
              onClick={() => setSettingsOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 16, 24, 0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2rem",
                zIndex: 25,
              }}
            >
              <div
                onClick={(event) => event.stopPropagation()}
                style={{
                  background: "#ffffff",
                  borderRadius: "20px",
                  padding: "1.5rem",
                  width: "min(1100px, 100%)",
                  maxHeight: "85vh",
                  overflow: "auto",
                  boxShadow: "0 30px 70px rgba(20, 20, 20, 0.3)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h2 style={{ marginTop: 0 }}>Settings</h2>
                    <p style={{ marginTop: "0.25rem", color: "#6f6a60" }}>
                      Manage printers, API keys, and fleet tools.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(false)}
                    style={{
                      border: "none",
                      background: "#f2f2f2",
                      borderRadius: "999px",
                      padding: "0.35rem 0.7rem",
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1.5rem",
                    marginTop: "1.25rem",
                  }}
                >
                  <div>
                    <h3 style={{ marginTop: 0 }}>{editingPrinterId ? "Edit Printer" : "Add Printer"}</h3>
                    <form
                      onSubmit={editingPrinterId ? handleUpdatePrinter : handleAddPrinter}
                      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
                    >
                      <input
                        type="text"
                        placeholder="Printer name"
                        value={form.name}
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                        style={{ padding: "0.6rem 0.75rem", borderRadius: "10px", border: "1px solid #e0dedb" }}
                      />
                      <input
                        type="text"
                        placeholder="Base URL (e.g. http://klipper.local)"
                        value={form.baseUrl}
                        onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
                        style={{ padding: "0.6rem 0.75rem", borderRadius: "10px", border: "1px solid #e0dedb" }}
                      />
                      <input
                        type="password"
                        placeholder={editingPrinterId ? "New API key (optional)" : "Moonraker API key (optional)"}
                        value={form.apiKey}
                        onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                        style={{ padding: "0.6rem 0.75rem", borderRadius: "10px", border: "1px solid #e0dedb" }}
                      />
                      <input
                        type="text"
                        placeholder="Tags (optional)"
                        value={form.tags}
                        onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
                        style={{ padding: "0.6rem 0.75rem", borderRadius: "10px", border: "1px solid #e0dedb" }}
                      />
                      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                        <button
                          type="submit"
                          style={{
                            padding: "0.75rem 1rem",
                            borderRadius: "12px",
                            border: "none",
                            background: "#1d1c1a",
                            color: "#fff",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {editingPrinterId ? "Save Changes" : "Save Printer"}
                        </button>
                        {editingPrinterId && (
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            style={{
                              padding: "0.75rem 1rem",
                              borderRadius: "12px",
                              border: "1px solid #e0dedb",
                              background: "#fff",
                              color: "#1d1c1a",
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                      {formStatus && <div style={{ color: "#2f5cff" }}>{formStatus}</div>}
                    </form>

                    <div style={{ marginTop: "1.5rem" }}>
                      <h3 style={{ marginTop: 0 }}>API Key</h3>
                      <div
                        style={{
                          background: "#f8f4f0",
                          borderRadius: "12px",
                          padding: "0.75rem 1rem",
                          color: "#6f6a60",
                          fontSize: "0.85rem",
                        }}
                      >
                        Rotating the API key will disconnect existing slicers until they are updated.
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.75rem",
                          maxWidth: "520px",
                          marginTop: "0.75rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            background: "#fff",
                            borderRadius: "12px",
                            padding: "0.75rem 1rem",
                            border: "1px solid #e0dedb",
                          }}
                        >
                          <input
                            type={showApiKey ? "text" : "password"}
                            value={apiKey ?? ""}
                            readOnly
                            style={{
                              flex: 1,
                              background: "transparent",
                              border: "none",
                              color: "#1d1c1a",
                              fontSize: "0.9rem",
                              fontFamily: "monospace",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey((prev) => !prev)}
                            style={{
                              padding: "0.4rem 0.7rem",
                              borderRadius: "999px",
                              border: "1px solid #e0dedb",
                              background: "transparent",
                              color: "#1d1c1a",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                            }}
                          >
                            {showApiKey ? "Hide" : "Show"}
                          </button>
                          <button
                            type="button"
                            onClick={handleCopyApiKey}
                            style={{
                              padding: "0.4rem 0.7rem",
                              borderRadius: "999px",
                              border: "1px solid #e0dedb",
                              background: "transparent",
                              color: "#1d1c1a",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                            }}
                          >
                            Copy
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={handleRotateApiKey}
                            style={{
                              padding: "0.6rem 1rem",
                              borderRadius: "12px",
                              border: "none",
                              background: "#f5c76b",
                              color: "#1d1c1a",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Rotate API Key
                          </button>
                          {apiKeyStatus && <div style={{ color: "#b0721f" }}>{apiKeyStatus}</div>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ marginTop: 0 }}>Printers</h3>
                    {printers.length === 0 ? (
                      <p style={{ color: "#6f6a60" }}>No printers yet.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        {printers.map((printer) => {
                          const statusEntry = printerStatus[printer.id];
                          const targetStatus = selectedJob?.targets.find(
                            (target) => target.printer_id === printer.id
                          )?.status;
                          const summary = statusSummary(statusEntry, targetStatus);
                          return (
                            <div
                              key={printer.id}
                              style={{
                                border: "1px solid #e0dedb",
                                borderRadius: "12px",
                                padding: "0.75rem 1rem",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "0.75rem",
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 600 }}>{printer.name}</div>
                                <div style={{ fontSize: "0.85rem", color: "#6f6a60" }}>{printer.base_url}</div>
                                {printer.tags && (
                                  <div style={{ fontSize: "0.8rem", color: "#6f6a60" }}>
                                    Tags: {printer.tags}
                                  </div>
                                )}
                                <div
                                  style={{
                                    fontSize: "0.85rem",
                                    color: summary.color,
                                  }}
                                >
                                  {summary.label}
                                  {statusEntry?.state_message ? ` · ${statusEntry.state_message}` : ""}
                                </div>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "0.5rem",
                                  alignItems: "flex-end",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "0.5rem",
                                    flexWrap: "wrap",
                                    justifyContent: "flex-end",
                                  }}
                                >
                                  {statusEntry?.web_uis.map((link) => (
                                    <a
                                      key={link.url}
                                      href={link.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        padding: "0.4rem 0.6rem",
                                        borderRadius: "999px",
                                        border: "1px solid #e0dedb",
                                        color: "#2f5cff",
                                        textDecoration: "none",
                                        fontSize: "0.8rem",
                                      }}
                                    >
                                      {link.label}
                                    </a>
                                  ))}
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "0.5rem",
                                    flexWrap: "wrap",
                                    justifyContent: "flex-end",
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => openFileModal(printer)}
                                    style={{
                                      padding: "0.4rem 0.6rem",
                                      borderRadius: "999px",
                                      border: "1px solid #e0dedb",
                                      background: "#f8f4f0",
                                      color: "#1d1c1a",
                                      cursor: "pointer",
                                      fontSize: "0.8rem",
                                    }}
                                  >
                                    Files
                                  </button>
                            <button
                              type="button"
                              onClick={() => handleTestPrinter(printer.id)}
                              style={{
                                padding: "0.4rem 0.6rem",
                                borderRadius: "999px",
                                border: "1px solid #e0dedb",
                                background: "#fff",
                                color: "#1d1c1a",
                                cursor: "pointer",
                                fontSize: "0.8rem",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                              }}
                              disabled={Boolean(busyPrinters[printer.id])}
                            >
                              {busyPrinters[printer.id] ? (
                                <>
                                  <span
                                    style={{
                                      width: "12px",
                                      height: "12px",
                                      borderRadius: "999px",
                                      border: "2px solid #c8c1b4",
                                      borderTopColor: "#2f5cff",
                                      display: "inline-block",
                                      animation: "spin 0.8s linear infinite",
                                    }}
                                  />
                                  Testing
                                </>
                              ) : (
                                "Test"
                              )}
                            </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEditPrinter(printer)}
                                    style={{
                                      padding: "0.4rem 0.6rem",
                                      borderRadius: "999px",
                                      border: "1px solid #e0dedb",
                                      background: "#fff",
                                      color: "#1d1c1a",
                                      cursor: "pointer",
                                      fontSize: "0.8rem",
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePrinter(printer.id)}
                                    style={{
                                      padding: "0.4rem 0.6rem",
                                      borderRadius: "999px",
                                      border: "1px solid #f2d1cb",
                                      background: "#fff5f2",
                                      color: "#b24c32",
                                      cursor: "pointer",
                                      fontSize: "0.8rem",
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                                <div style={{ fontSize: "0.85rem", color: printer.enabled ? "#1a7f37" : "#b24c32" }}>
                                  {printer.enabled ? "Enabled" : "Disabled"}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
      {uiModal && (
      <div
        onClick={() => setUiModal(null)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10, 12, 18, 0.75)",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "stretch",
          padding: "2rem",
          zIndex: 30,
        }}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            background: "#0f111a",
            borderRadius: "18px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 30px 80px rgba(10, 12, 18, 0.45)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.9rem 1.2rem",
              background: "#151826",
              color: "#fef7ee",
            }}
          >
            <div style={{ fontWeight: 600 }}>{uiModal.printer.name} · Printer UI</div>
            <button
              type="button"
              onClick={() => setUiModal(null)}
              style={{
                border: "none",
                background: "#2b2f45",
                color: "#fef7ee",
                borderRadius: "999px",
                padding: "0.35rem 0.75rem",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Close
            </button>
          </div>
          <iframe
            src={uiModal.url}
            title={`${uiModal.printer.name} UI`}
            style={{ border: "none", width: "100%", height: "100%", flex: 1, background: "#0f111a" }}
          />
        </div>
      </div>
    )}
    </>
  );
}


