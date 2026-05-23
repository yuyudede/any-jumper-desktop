import { useCallback, useEffect, useRef, useState } from "react";
import type { GitStatus } from "../types";
import { desktopApi } from "./desktopApi";

export interface GitChangeFile {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  status: string; // combined status code e.g. "M ", "??", "A "
}

export interface GitServiceState {
  status: GitStatus | null;
  loading: boolean;
  error: string | null;
}

export function useGitService(rootPath: string | undefined) {
  const [state, setState] = useState<GitServiceState>({
    status: null,
    loading: false,
    error: null,
  });
  const versionRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!rootPath) return;
    const fetchVersion = ++versionRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const status = await desktopApi.gitStatus(rootPath);
      if (fetchVersion !== versionRef.current) return;
      setState({ status, loading: false, error: null });
    } catch (err) {
      if (fetchVersion !== versionRef.current) return;
      setState({
        status: null,
        loading: false,
        error: err instanceof Error ? err.message : "获取 Git 状态失败",
      });
    }
  }, [rootPath]);

  // Auto-refresh on mount and when rootPath changes
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refresh on window focus
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const getFileDiff = useCallback(
    async (filePath: string): Promise<string> => {
      if (!rootPath) throw new Error("No root path");
      return desktopApi.gitDiff(rootPath, false);
    },
    [rootPath],
  );

  const getFileDiffContents = useCallback(
    async (filePath: string): Promise<{ oldContent: string; newContent: string }> => {
      if (!rootPath) throw new Error("No root path");
      const [oldContent, newContent] = await Promise.all([
        desktopApi
          .readFileContentAtRef(rootPath, filePath, "HEAD")
          .catch(() => ""),
        desktopApi
          .readFileContent(`${rootPath}/${filePath}`)
          .catch(() => ""),
      ]);
      return { oldContent, newContent };
    },
    [rootPath],
  );

  const revertFile = useCallback(
    async (filePath: string): Promise<void> => {
      if (!rootPath) throw new Error("No root path");
      await desktopApi.gitRevertFile(rootPath, filePath);
      await refresh();
    },
    [rootPath, refresh],
  );

  // Split entries: tracked changes vs untracked
  const changedFiles: GitChangeFile[] = state.status?.entries
    .filter((e) => e.worktreeStatus !== "?" && e.indexStatus !== "?")
    .map((e) => ({
      path: e.path,
      indexStatus: e.indexStatus,
      worktreeStatus: e.worktreeStatus,
      status: `${e.indexStatus}${e.worktreeStatus}`.trim() || "M",
    })) ?? [];

  const untrackedFiles: GitChangeFile[] = state.status?.entries
    .filter((e) => e.worktreeStatus === "?" || e.indexStatus === "?")
    .map((e) => ({
      path: e.path,
      indexStatus: e.indexStatus,
      worktreeStatus: e.worktreeStatus,
      status: "??",
    })) ?? [];

  return {
    ...state,
    changedFiles,
    untrackedFiles,
    refresh,
    getFileDiff,
    getFileDiffContents,
    revertFile,
  };
}
