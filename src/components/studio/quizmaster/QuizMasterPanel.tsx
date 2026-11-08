"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ApiError, api, buttonClass, cardClass, type Status } from "./api";
import { GuestCleanupForm, ManualRunForm, type ManualRunInput } from "./Forms";
import RunHistory from "./RunHistory";
import StatusCard from "./StatusCard";
import Stopwatch, { type StopwatchState } from "./Stopwatch";
import { useRunDriver } from "./useRunDriver";

/** Background status refresh. Must stay well above Neon's 5-minute scale-to-zero delay. */
const STATUS_REFRESH_MS = 15 * 60_000;

interface StartResponse {
  runId: string;
  created: boolean;
  resumed: boolean;
}

/**
 * Studio → Quiz Master. The countdown comes from the database (`nextRunAt`),
 * so every tab and device shows the same one; it is recomputed from the
 * wall clock every second, never by counting ticks, so a throttled
 * background tab or a sleeping laptop can't drift it. When it reaches zero
 * while the tab is open (or is already past on open) the page starts the run
 * and drives it to the end.
 */
export default function QuizMasterPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /** Server time minus browser time, so a wrong device clock can't fire early. */
  const skew = useRef(0);
  const starting = useRef(false);
  const lastAutoStart = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const s = await api<Status>("/schedule");
      skew.current = new Date(s.serverNow).getTime() - Date.now();
      setStatus(s);
      setError(null);
      return s;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load Quiz Master.");
      return null;
    }
  }, []);

  /** Runs this tab saw finish, so a status fetched just before isn't re-driven. */
  const finished = useRef(new Set<string>());
  const driver = useRunDriver((id, runStatus) => {
    finished.current.add(id);
    const msg = `Run finished: ${runStatus}.`;
    if (runStatus === "succeeded") toast.success(msg);
    else if (runStatus === "cancelled") toast(msg);
    else toast.error(msg);
    void refresh();
  });

  const { drive, isDriving } = driver;
  const startRun = useCallback(
    async (body: Record<string, unknown>, quiet = false) => {
      try {
        const res = await api<StartResponse>("/runs", { method: "POST", body });
        if (!quiet) toast.success(res.resumed ? "Resuming the unfinished run." : "Run started.");
        finished.current.delete(res.runId);
        void drive(res.runId);
        void refresh();
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409 && err.details?.runId) {
          // Another run holds the lock: follow it rather than fight it.
          if (!quiet) toast(err.message);
          void drive(err.details.runId);
          return false;
        }
        if (!quiet || !(err instanceof ApiError && err.status === 409)) {
          toast.error(err instanceof Error ? err.message : "Couldn't start the run.");
        }
        return false;
      }
    },
    [drive, refresh]
  );

  // First load, then a light refresh every 15 minutes (another device may change things).
  // Keep this well above Neon's 5-minute scale-to-zero delay: a tab left open polling
  // every minute kept the database awake around the clock and used up the free plan.
  // The countdown runs on the local clock, so due runs still start on time.
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), STATUS_REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // The 1 s clock for the display.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const serverNow = now + skew.current;

  // Resume unfinished runs, or start the scheduled one when it's due.
  const drivenIds = Object.keys(driver.runs);
  useEffect(() => {
    if (!status || starting.current) return;
    const active = status.activeRuns.filter((r) => !finished.current.has(r.id));
    for (const run of active) {
      if (!isDriving(run.id)) void drive(run.id, run.progress);
    }
    if (active.some((r) => r.kind !== "guest_cleanup") || drivenIds.length) return;
    const { schedule } = status;
    const due = !schedule.paused && (!schedule.nextRunAt || new Date(schedule.nextRunAt).getTime() <= serverNow);
    // At most one automatic attempt a minute, whatever the server answers.
    if (due && serverNow - lastAutoStart.current > 60_000) {
      lastAutoStart.current = serverNow;
      starting.current = true;
      void startRun({ kind: "scheduled", trigger: "timer" }, true).finally(() => {
        starting.current = false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, serverNow, drive, startRun, drivenIds.length]);

  const patch = async (body: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    try {
      const s = await api<Status>("/schedule", { method: "PATCH", body });
      skew.current = new Date(s.serverNow).getTime() - Date.now();
      setStatus(s);
      if (ok) toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the schedule.");
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <div className={cardClass}>
        {error ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
            <span>{error}</span>
            <button type="button" className={buttonClass} onClick={() => void refresh()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Retry
            </button>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        )}
      </div>
    );
  }

  // The stopwatch follows the question-bank run (the automatic one).
  const bankRun = status.activeRuns.find((r) => r.kind !== "guest_cleanup" && !finished.current.has(r.id)) ?? null;
  const running = Boolean(bankRun);
  const overdue =
    !status.schedule.paused && (!status.schedule.nextRunAt || new Date(status.schedule.nextRunAt).getTime() <= serverNow);
  const state: StopwatchState = running ? "running" : status.schedule.paused ? "paused" : overdue ? "overdue" : "idle";
  const driven = bankRun ? driver.runs[bankRun.id] : undefined;
  const progress = driven?.progress ?? bankRun?.progress ?? null;

  return (
    <div className="space-y-6">
      {!status.env.QUIZMASTER_FIREBASE_SERVICE_ACCOUNT && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
          <p>
            <code>QUIZMASTER_FIREBASE_SERVICE_ACCOUNT</code> isn&apos;t set, so only dry runs work (against an empty
            Firestore). Add the Firebase Admin SDK key as a GitHub secret and redeploy.
          </p>
        </div>
      )}
      <Stopwatch
        status={status}
        now={serverNow}
        state={state}
        progress={progress}
        waiting={Boolean(driven?.waiting)}
        busy={busy}
        onRunNow={() => void startRun({ kind: "scheduled", trigger: "now" })}
        onPause={(paused) => void patch({ action: paused ? "pause" : "resume" }, paused ? "Schedule paused." : "Schedule resumed.")}
        onReset={() => void patch({ action: "reset" }, "Timer reset.")}
        onInterval={(hours) => void patch({ action: "interval", intervalHours: hours }, `Interval set to ${hours} h.`)}
        onSetNext={(iso) => void patch({ action: "setNext", nextRunAt: iso }, "Next run time set.")}
      />
      <StatusCard status={status} />
      <div className="grid gap-6 xl:grid-cols-2">
        <ManualRunForm
          categories={status.categories}
          disabled={running}
          onSubmit={async (v: ManualRunInput) => {
            await startRun({
              kind: "question_bank",
              slot: v.slot,
              date: v.date,
              force: v.force,
              dryRun: v.dryRun,
              mode: v.mode,
              confirm: v.confirm,
              categories: v.categories,
            });
          }}
        />
        <GuestCleanupForm
          disabled={false}
          onSubmit={async (days, dryRun) => {
            if (!dryRun && !window.confirm(`Delete every guest account inactive for more than ${days} days?`)) return;
            await startRun({ kind: "guest_cleanup", days, dryRun });
          }}
        />
      </div>
      <RunHistory runs={status.runs} onChanged={() => void refresh()} />
    </div>
  );
}
