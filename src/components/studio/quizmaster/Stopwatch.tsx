"use client";

import { useState } from "react";
import { Loader2, Pause, Play, RotateCcw, Sunrise, Timer, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buttonClass,
  cardClass,
  clock,
  fmtIst,
  inputClass,
  istInputToIso,
  nextSevenIst,
  primaryButtonClass,
  type Progress,
  type Status,
} from "./api";

const PRESETS = [11, 11.5, 12];

export type StopwatchState = "idle" | "overdue" | "running" | "paused";

export default function Stopwatch({
  status,
  now,
  state,
  progress,
  waiting,
  busy,
  onRunNow,
  onPause,
  onReset,
  onInterval,
  onSetNext,
}: {
  status: Status;
  now: number;
  state: StopwatchState;
  progress: Progress | null;
  waiting: boolean;
  busy: boolean;
  onRunNow: () => void;
  onPause: (paused: boolean) => void;
  onReset: () => void;
  onInterval: (hours: number) => void;
  onSetNext: (iso: string) => void;
}) {
  const { schedule } = status;
  const [custom, setCustom] = useState(String(schedule.intervalHours));
  const [nextInput, setNextInput] = useState("");

  const totalMs = schedule.intervalHours * 3_600_000;
  const remaining = schedule.nextRunAt ? Math.max(0, new Date(schedule.nextRunAt).getTime() - now) : 0;
  const ratio =
    state === "running"
      ? progress && progress.total
        ? progress.done / progress.total
        : 0
      : state === "overdue"
        ? 1
        : Math.min(1, Math.max(0, 1 - remaining / totalMs));

  const R = 88;
  const C = 2 * Math.PI * R;

  const label =
    state === "running" ? "Running" : state === "overdue" ? "Overdue" : state === "paused" ? "Paused" : "Next run in";

  return (
    <section className={cardClass} aria-labelledby="qm-stopwatch">
      <div className="flex items-center justify-between gap-3">
        <p id="qm-stopwatch" className="micro-label">
          Automatic run
        </p>
        <span
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs font-medium",
            state === "running" && "border-accent-500/40 text-accent-600 dark:text-accent-400",
            state === "overdue" && "border-amber-500/40 text-amber-600 dark:text-amber-400",
            state === "paused" && "border-[var(--border)] text-[var(--muted)]",
            state === "idle" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
          )}
        >
          {state === "running" ? "running" : state}
        </span>
      </div>

      <div className="mt-4 flex flex-col items-center gap-6 md:flex-row md:items-center">
        <div className="relative h-52 w-52 shrink-0">
          <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="100" cy="100" r={R} fill="none" stroke="var(--border)" strokeWidth="10" />
            <circle
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - ratio)}
              className="transition-[stroke-dashoffset] duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xs text-[var(--muted)]">{label}</span>
            {state === "running" ? (
              <>
                <Loader2 className="my-1 h-7 w-7 animate-spin text-accent-600 dark:text-accent-400" aria-hidden />
                <span className="font-mono text-sm tabular-nums">
                  {progress ? `${progress.done}/${progress.total} steps` : "starting…"}
                </span>
              </>
            ) : (
              <span
                className={cn(
                  "font-mono text-4xl font-semibold tabular-nums tracking-tight",
                  state === "overdue" && "text-amber-600 dark:text-amber-400",
                  state === "paused" && "text-[var(--muted)]"
                )}
                aria-live="off"
              >
                {state === "overdue" ? "00:00:00" : clock(remaining)}
              </span>
            )}
          </div>
        </div>

        <div className="w-full min-w-0 flex-1 space-y-4">
          {state === "running" ? (
            <div aria-live="polite">
              <p className="text-sm font-medium">{progress?.current || "Working…"}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {progress ? `${progress.done} of ~${progress.total} steps` : ""}
                {waiting ? " · another tab is working on this run" : ""}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm">
                Next run: <span className="font-medium">{schedule.nextRunAt ? fmtIst(schedule.nextRunAt) : "not set"}</span>
              </p>
              {state === "overdue" && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Overdue: starting the catch-up run…</p>}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButtonClass} onClick={onRunNow} disabled={busy || state === "running"}>
              <Zap className="h-4 w-4" aria-hidden /> Run now
            </button>
            <button type="button" className={buttonClass} onClick={() => onPause(!schedule.paused)} disabled={busy}>
              {schedule.paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
              {schedule.paused ? "Resume" : "Pause"}
            </button>
            <button type="button" className={buttonClass} onClick={onReset} disabled={busy || state === "running"}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Reset timer
            </button>
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <Timer className="h-3.5 w-3.5" aria-hidden /> Interval
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div role="radiogroup" aria-label="Interval" className="inline-flex overflow-hidden rounded-lg border border-[var(--border)]">
                {PRESETS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    role="radio"
                    aria-checked={schedule.intervalHours === h}
                    disabled={busy}
                    onClick={() => onInterval(h)}
                    className={cn(
                      "px-3 py-1.5 text-sm transition-colors",
                      schedule.intervalHours === h
                        ? "bg-accent-500 font-semibold text-ink-950"
                        : "text-[var(--muted)] hover:text-[var(--fg)]"
                    )}
                  >
                    {h} h
                  </button>
                ))}
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Math.min(12, Math.max(11, Number(custom)));
                  if (Number.isFinite(n)) {
                    setCustom(String(n));
                    onInterval(n);
                  }
                }}
              >
                <label className="sr-only" htmlFor="qm-interval">
                  Interval in hours (11 to 12)
                </label>
                <input
                  id="qm-interval"
                  type="number"
                  min={11}
                  max={12}
                  step={0.25}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  className={cn(inputClass, "w-24")}
                />
                <button type="submit" className={buttonClass} disabled={busy}>
                  Set
                </button>
              </form>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs text-[var(--muted)]">Line the timer up (IST)</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={buttonClass} disabled={busy || state === "running"} onClick={() => onSetNext(nextSevenIst())}>
                <Sunrise className="h-4 w-4" aria-hidden /> Next 07:00 IST
              </button>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (nextInput) onSetNext(istInputToIso(nextInput));
                }}
              >
                <label className="sr-only" htmlFor="qm-next">
                  Next run time in IST
                </label>
                <input
                  id="qm-next"
                  type="datetime-local"
                  value={nextInput}
                  onChange={(e) => setNextInput(e.target.value)}
                  className={cn(inputClass, "w-auto")}
                />
                <button type="submit" className={buttonClass} disabled={busy || !nextInput}>
                  Set
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-1.5 rounded-xl border border-[var(--border)] p-4 text-xs leading-relaxed text-[var(--muted)]">
        <p className="text-[var(--fg)]">
          Automatic runs only happen while this tab is open. Keep it open (e.g. on a spare device), or press Run now.
        </p>
        <p>
          The daily quiz is only published by a run that reaches its daily-quiz step before 12:00 IST, the same as
          before; after that the app plays its local quiz. Line the timer up with about 07:00 IST: the morning run
          then publishes the quiz and the evening run (from 15:00 IST) adds the <code>pm</code> questions.
        </p>
        <p>
          If this tab closes mid-run, the run waits and carries on the next time the tab is opened. Guest cleanup runs
          at the end of an automatic run at most once every 24 hours.
        </p>
      </div>
    </section>
  );
}
