"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api, type Progress, type TickResponse } from "./api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The wait before the next tick. A tick that worked its full slice goes again
 * at once. A quick one (nothing could start, every model was busy) waits a
 * little, and a run another tab is driving is only checked on: each call
 * costs database reads, and the free plan counts them.
 */
export function nextTickDelay(busy: boolean, tookMs: number): number {
  if (busy) return 15_000;
  return tookMs < 10_000 ? 3_000 : 300;
}

/** Keeps the screen on while a run is in progress, where the browser allows it. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: { release(): Promise<void> } | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
        lock = await wl.request("screen");
        if (cancelled) await lock.release();
      } catch {
        // Denied (e.g. battery saver) or the tab is hidden: runs still work.
      }
    };
    // A wake lock is dropped when the tab is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}

export interface DrivenRun {
  progress: Progress | null;
  /** Another tab's tick is working on this run right now. */
  waiting: boolean;
}

/**
 * Drives runs to the end: for each, calls `tick` in a loop, one request in
 * flight at a time, until the server says it's done. If the tab closes, the
 * run waits in the database and the next open (or any other tab) resumes it.
 */
export function useRunDriver(onFinished: (runId: string, status: string) => void) {
  const [runs, setRuns] = useState<Record<string, DrivenRun>>({});
  const driving = useRef(new Set<string>());
  const mounted = useRef(true);
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      driving.current.clear();
    };
  }, []);

  useWakeLock(Object.keys(runs).length > 0);

  const update = (id: string, patch: Partial<DrivenRun>) =>
    mounted.current && setRuns((r) => ({ ...r, [id]: { progress: null, waiting: false, ...r[id], ...patch } }));

  const drive = useCallback(async (id: string, initial?: Progress) => {
    if (driving.current.has(id)) return;
    driving.current.add(id);
    update(id, initial ? { progress: initial } : {});
    let failures = 0;
    try {
      while (mounted.current && driving.current.has(id)) {
        let res: TickResponse;
        let started = Date.now();
        try {
          started = Date.now();
          res = await api<TickResponse>(`/runs/${id}/tick`, { method: "POST" });
          failures = 0;
        } catch (err) {
          const code = (err as { status?: number }).status;
          if (code === 404 || code === 401) break;
          failures += 1;
          if (failures === 1 || failures % 5 === 0) {
            toast.error(`${err instanceof Error ? err.message : "Tick failed."} Retrying…`);
          }
          await sleep(Math.min(60_000, 5_000 * failures));
          continue;
        }
        update(id, { progress: res.progress, waiting: Boolean(res.busy) });
        if (res.done) {
          finishedRef.current(id, res.status);
          break;
        }
        await sleep(nextTickDelay(Boolean(res.busy), Date.now() - started));
      }
    } finally {
      driving.current.delete(id);
      if (mounted.current) {
        setRuns((r) => {
          const next = { ...r };
          delete next[id];
          return next;
        });
      }
    }
  }, []);

  return { runs, drive, isDriving: (id: string) => driving.current.has(id) };
}
