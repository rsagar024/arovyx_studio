"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, RefreshCw } from "lucide-react";
import GuestCleanupForm from "./GuestCleanupForm";
import RunHistory from "./RunHistory";
import { ApiError, MIN_DAYS, api, buttonClass, cardClass, fmtIst, inputClass, labelClass, type StartResponse, type Status } from "./api";
import { useRunDriver } from "./useRunDriver";

/** Background status refresh: rare, since each refresh costs database reads. */
const STATUS_REFRESH_MS = 15 * 60_000;

/**
 * Studio → Color Tap. Runs only from this open tab: an unfinished run resumes
 * on open, and a cleanup starts when automatic cleanup is on and the server
 * says one is due. Without a usable key the tab shows why and starts nothing.
 */
export default function ColorTapPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [daysInput, setDaysInput] = useState<string | null>(null);
  const starting = useRef(false);
  const lastAutoStart = useRef(0);
  /** Runs this tab saw finish, so a status fetched just before isn't re-driven. */
  const finished = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      setStatus(await api<Status>("/status"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load Color Tap.");
    }
  }, []);

  const { drivingId, drive, isDriving } = useRunDriver((id, runStatus) => {
    finished.current.add(id);
    const msg = `Run finished: ${runStatus}.`;
    if (runStatus === "succeeded") toast.success(msg);
    else if (runStatus === "cancelled") toast(msg);
    else toast.error(msg);
    void refresh();
  });

  const startRun = useCallback(
    async (body: Record<string, unknown>, quiet = false) => {
      try {
        const res = await api<StartResponse>("/runs", { method: "POST", body });
        if (!quiet) toast.success(res.resumed ? "Resuming the unfinished run." : "Run started.");
        finished.current.delete(res.runId);
        void drive(res.runId);
        void refresh();
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          // Another tab holds the lock: follow its run rather than fight it.
          if (!quiet) toast(err.message);
          if (err.details?.runId) void drive(err.details.runId);
          return;
        }
        toast.error(err instanceof Error ? err.message : "Couldn't start the run.");
      }
    },
    [drive, refresh]
  );

  // First load, then a light refresh every 15 minutes, and on returning to the tab.
  // Keep it rare, since every refresh costs Firestore reads (cleanup is daily;
  // 15 min late is fine).
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), STATUS_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Resume an unfinished run, or start the automatic one when it's due.
  useEffect(() => {
    if (!status || status.keyProblem || starting.current || drivingId) return;
    const active = status.active && !finished.current.has(status.active.id) ? status.active : null;
    if (active) {
      if (!isDriving(active.id)) void drive(active.id);
      return;
    }
    if (!status.schedule.due) return;
    // At most one automatic attempt a minute, whatever the server answers.
    if (Date.now() - lastAutoStart.current > 60_000) {
      lastAutoStart.current = Date.now();
      starting.current = true;
      void startRun({ kind: "scheduled" }, true).finally(() => {
        starting.current = false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, drive, startRun, drivingId]);

  const patch = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      setStatus(await api<Status>("/status", { method: "PATCH", body }));
      toast.success(ok);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
      return false;
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

  const { schedule } = status;
  const daysValue = daysInput ?? String(schedule.days);
  const days = Number(daysValue);
  const daysValid = Number.isInteger(days) && days >= MIN_DAYS;

  const toggleAuto = (enabled: boolean) => {
    const sure =
      !enabled ||
      window.confirm(
        `While this tab is open, delete guests inactive for more than ${schedule.days} days, about once a day? Check the counts with a dry run first.`
      );
    if (sure) void patch({ action: "auto", enabled }, enabled ? "Automatic cleanup on." : "Automatic cleanup off.");
  };

  return (
    <div className="space-y-6">
      {status.keyProblem && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
          <p>{status.keyProblem} Nothing can run until it is fixed: add the key as a GitHub secret and redeploy.</p>
        </div>
      )}

      <section className={cardClass} aria-labelledby="ct-status">
        <p id="ct-status" className="micro-label">
          Status
        </p>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-semibold">Firebase project</dt>
            <dd className="mt-1 text-[var(--muted)]">
              <code className="text-xs">{status.projectId}</code>
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Last real cleanup</dt>
            <dd className="mt-1 text-[var(--muted)]">{schedule.lastCleanupAt ? fmtIst(schedule.lastCleanupAt) : "Never (from here)."}</dd>
          </div>
          <div>
            <dt className="font-semibold">Next automatic run</dt>
            <dd className="mt-1 text-[var(--muted)]">
              {!schedule.autoEnabled
                ? "Off."
                : schedule.due
                  ? "Due now."
                  : `${fmtIst(schedule.nextAutoAt)}, or the next time this tab is open after that.`}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-4 border-t border-[var(--border)] pt-5">
          <label htmlFor="ct-auto" className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              id="ct-auto"
              type="checkbox"
              className="h-4 w-4 accent-cyan-500"
              checked={schedule.autoEnabled}
              disabled={busy}
              onChange={(e) => toggleAuto(e.target.checked)}
            />
            Automatic cleanup while this tab is open
          </label>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!daysValid) return;
              if (await patch({ action: "days", days }, `Automatic runs now use ${days} days.`)) setDaysInput(null);
            }}
          >
            <div>
              <label htmlFor="ct-auto-days" className={labelClass}>
                Automatic runs: inactive for more than (days, ≥ {MIN_DAYS})
              </label>
              <input
                id="ct-auto-days"
                type="number"
                min={MIN_DAYS}
                step={1}
                className={`${inputClass} w-32`}
                value={daysValue}
                aria-invalid={!daysValid}
                onChange={(e) => setDaysInput(e.target.value)}
              />
            </div>
            <button type="submit" className={buttonClass} disabled={busy || !daysValid || days === schedule.days}>
              Save
            </button>
          </form>
        </div>
      </section>

      <GuestCleanupForm
        key={schedule.days}
        defaultDays={schedule.days}
        disabled={Boolean(status.keyProblem) || Boolean(drivingId)}
        onSubmit={async (d, dryRun) => {
          if (!dryRun && !window.confirm(`Delete every Color Tap guest account inactive for more than ${d} days?`)) return;
          await startRun({ kind: "guest_cleanup", days: d, dryRun });
        }}
      />

      <RunHistory runs={status.runs} onChanged={() => void refresh()} />
    </div>
  );
}
