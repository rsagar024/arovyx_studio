"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api, type TickResponse } from "./api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The wait before the next tick. A tick that worked its full slice goes again
 * at once. A quick one (nothing could start, every model was busy) waits a
 * little, and a run another tab is driving is only checked on: each call
 * costs database reads, and the free plan counts them.
 */
export function nextTickDelay(busy: boolean, tookMs: number): number {
  if (busy) return 30_000;
  return tookMs < 10_000 ? 3_000 : 300;
}

/**
 * Drives a run to the end: calls `tick` in a loop, one request in flight at a
 * time, until the server says it's done. If the tab closes, the run waits in
 * the database and the next open (or any other tab) resumes it.
 */
export function useRunDriver(onFinished: (runId: string, status: string) => void) {
  const [drivingId, setDrivingId] = useState<string | null>(null);
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

  const drive = useCallback(async (id: string) => {
    if (driving.current.has(id)) return;
    driving.current.add(id);
    setDrivingId(id);
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
        if (res.done) {
          finishedRef.current(id, res.status);
          break;
        }
        await sleep(nextTickDelay(Boolean(res.busy), Date.now() - started));
      }
    } finally {
      driving.current.delete(id);
      if (mounted.current) setDrivingId((current) => (current === id ? null : current));
    }
  }, []);

  return { drivingId, drive, isDriving: (id: string) => driving.current.has(id) };
}
