import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  installerAPI,
  type DetectedInstaller,
  type InstallJob,
  type InstallMode,
  type InstallerEnv,
  type LogLine,
  type RunRequest,
} from "../lib/installer";

export interface QueueItem {
  key: string;
  detected: DetectedInstaller;
  mode: InstallMode;
  targetDir: string;
  customArgs: string;
  timeoutMinutes: number;
  jobId?: string;
}

interface InstallerContextValue {
  available: boolean;
  env: InstallerEnv | null;
  queue: QueueItem[];
  jobs: Record<string, InstallJob>;
  logs: Record<string, LogLine[]>;
  history: InstallJob[];
  busy: boolean;
  addDetected: (items: DetectedInstaller[]) => void;
  addPaths: (paths: string[]) => Promise<void>;
  pickFiles: () => Promise<void>;
  updateItem: (key: string, patch: Partial<QueueItem>) => void;
  removeItem: (key: string) => void;
  clearQueue: () => void;
  runItem: (key: string) => Promise<void>;
  runAll: () => Promise<void>;
  runRequest: (request: RunRequest) => Promise<InstallJob | null>;
  cancel: (jobId: string) => Promise<void>;
  refreshHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
}

const InstallerContext = createContext<InstallerContextValue | null>(null);

export function InstallerProvider({ children }: { children: React.ReactNode }) {
  const api = installerAPI();
  const [env, setEnv] = useState<InstallerEnv | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [jobs, setJobs] = useState<Record<string, InstallJob>>({});
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({});
  const [history, setHistory] = useState<InstallJob[]>([]);
  const [busy, setBusy] = useState(false);
  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;

  const refreshHistory = useCallback(async () => {
    if (!api) return;
    setHistory(await api.history());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    void api.env().then(setEnv);
    void refreshHistory();

    const offLog = api.onLog((line) => {
      setLogs((prev) => {
        const current = prev[line.jobId] ?? [];
        return { ...prev, [line.jobId]: [...current.slice(-800), line] };
      });
    });
    const offJob = api.onJob((job) => {
      setJobs((prev) => ({ ...prev, [job.id]: job }));
      if (job.finishedAt) void refreshHistory();
    });
    return () => {
      offLog();
      offJob();
    };
  }, [api, refreshHistory]);

  const addDetected = useCallback((items: DetectedInstaller[]) => {
    if (items.length === 0) return;
    setQueue((prev) => {
      const existing = new Set(prev.map((i) => i.detected.path));
      const additions = items
        .filter((d) => !existing.has(d.path))
        .map<QueueItem>((detected) => ({
          key: `${detected.path}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          detected,
          mode: detected.supportedModes[0] ?? "custom",
          targetDir: "",
          customArgs: detected.engine === "unknown" ? "/S /norestart" : "",
          timeoutMinutes: 20,
        }));
      return [...prev, ...additions];
    });
  }, []);

  const addPaths = useCallback(
    async (paths: string[]) => {
      if (!api || paths.length === 0) return;
      addDetected(await api.detect(paths));
    },
    [api, addDetected],
  );

  const pickFiles = useCallback(async () => {
    if (!api) return;
    addDetected(await api.pick());
  }, [api, addDetected]);

  const updateItem = useCallback((key: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const removeItem = useCallback((key: string) => {
    setQueue((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const clearQueue = useCallback(() => setQueue([]), []);

  const runRequest = useCallback(
    async (request: RunRequest) => {
      if (!api) return null;
      setBusy(true);
      try {
        const job = await api.run(request);
        setJobs((prev) => ({ ...prev, [job.id]: job }));
        await refreshHistory();
        return job;
      } finally {
        setBusy(false);
      }
    },
    [api, refreshHistory],
  );

  const runItem = useCallback(
    async (key: string) => {
      const item = queueRef.current.find((i) => i.key === key);
      if (!item || !api) return;
      const request: RunRequest = {
        detected: item.detected,
        displayName: item.detected.fileName,
        timeoutMinutes: item.timeoutMinutes,
        options: {
          mode: item.mode,
          targetDir: item.targetDir || undefined,
          customArgs: item.customArgs || undefined,
        },
      };
      setBusy(true);
      try {
        const job = await api.run(request);
        setJobs((prev) => ({ ...prev, [job.id]: job }));
        updateItem(key, { jobId: job.id });
        await refreshHistory();
      } finally {
        setBusy(false);
      }
    },
    [api, refreshHistory, updateItem],
  );

  const runAll = useCallback(async () => {
    for (const item of queueRef.current) {
      if (item.jobId) continue;
      // Secuencial a propósito: Windows Installer procesa una instalación a la vez (error 1618)
      await runItem(item.key);
    }
  }, [runItem]);

  const cancel = useCallback(
    async (jobId: string) => {
      await api?.cancel(jobId);
    },
    [api],
  );

  const clearHistory = useCallback(async () => {
    await api?.clearHistory();
    await refreshHistory();
  }, [api, refreshHistory]);

  const value = useMemo<InstallerContextValue>(
    () => ({
      available: Boolean(api),
      env,
      queue,
      jobs,
      logs,
      history,
      busy,
      addDetected,
      addPaths,
      pickFiles,
      updateItem,
      removeItem,
      clearQueue,
      runItem,
      runAll,
      runRequest,
      cancel,
      refreshHistory,
      clearHistory,
    }),
    [
      api,
      env,
      queue,
      jobs,
      logs,
      history,
      busy,
      addDetected,
      addPaths,
      pickFiles,
      updateItem,
      removeItem,
      clearQueue,
      runItem,
      runAll,
      runRequest,
      cancel,
      refreshHistory,
      clearHistory,
    ],
  );

  return <InstallerContext.Provider value={value}>{children}</InstallerContext.Provider>;
}

export function useInstaller(): InstallerContextValue {
  const ctx = useContext(InstallerContext);
  if (!ctx) throw new Error("useInstaller debe usarse dentro de InstallerProvider");
  return ctx;
}
