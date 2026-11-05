"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronRight, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_STYLE, api, buttonClass, cardClass, fmtDuration, fmtIst, type RunDetail, type RunInfo } from "./api";

export default function RunHistory({ runs, onChanged }: { runs: RunInfo[]; onChanged: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section className={cardClass} aria-labelledby="ct-history">
      <p id="ct-history" className="micro-label">
        Run history
      </p>
      {runs.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">No runs yet.</p>
      ) : (
        <div className="mt-3 -mx-2 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="text-xs text-[var(--muted)]">
              <tr>
                <th className="px-2 py-2 font-medium">Started</th>
                <th className="px-2 py-2 font-medium">Run</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 text-right font-medium">Scanned</th>
                <th className="px-2 py-2 text-right font-medium">Guests</th>
                <th className="px-2 py-2 text-right font-medium">Stale</th>
                <th className="px-2 py-2 text-right font-medium">Deleted</th>
                <th className="px-2 py-2 text-right font-medium">Failed</th>
                <th className="px-2 py-2 font-medium">Took</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const open = openId === r.id;
                const Icon = open ? ChevronDown : ChevronRight;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-t border-[var(--border)]">
                      <td className="whitespace-nowrap px-2 py-2">{fmtIst(r.startedAt)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-xs text-[var(--muted)]">
                        {r.trigger === "timer" ? "automatic" : "manual"} · {r.days} days{r.dryRun ? " · dry run" : ""}
                      </td>
                      <td className="px-2 py-2">
                        <span className={cn("rounded-full border px-2 py-0.5 text-xs", STATUS_STYLE[r.status])}>{r.status}</span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.counts.scanned}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.counts.guests}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.counts.stale}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.counts.deleted}</td>
                      <td className={cn("px-2 py-2 text-right tabular-nums", r.counts.failed > 0 && "text-rose-500")}>{r.counts.failed}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-[var(--muted)]">
                        {r.finishedAt ? fmtDuration(new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) : "…"}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          aria-expanded={open}
                          className="inline-flex items-center gap-1 text-xs text-accent-600 hover:underline dark:text-accent-400"
                          onClick={() => setOpenId(open ? null : r.id)}
                        >
                          Log <Icon className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={10} className="px-2 pb-3">
                          <RunLog id={r.id} onChanged={onChanged} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RunLog({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [run, setRun] = useState<RunInfo | null>(null);
  const [logs, setLogs] = useState<RunDetail["logs"]>([]);
  const cursor = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const q = cursor.current ? `?after=${encodeURIComponent(cursor.current)}` : "";
        const d = await api<RunDetail>(`/runs/${id}${q}`);
        if (!alive) return;
        setRun(d.run);
        if (d.logs.length) {
          cursor.current = d.logs[d.logs.length - 1]!.at;
          setLogs((old) => [...old, ...d.logs].slice(-2000));
        }
        // Live while running.
        if (d.run.status === "running") timer = setTimeout(load, 3_000);
      } catch (err) {
        if (alive) toast.error(err instanceof Error ? err.message : "Couldn't load the run.");
      }
    };
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);

  const cancel = async () => {
    if (!window.confirm("Cancel this run? Guests already deleted stay deleted; the rest are skipped.")) return;
    try {
      await api(`/runs/${id}/cancel`, { method: "POST" });
      toast.success("Run cancelled.");
      setRun((r) => (r ? { ...r, status: "cancelled" } : r));
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't cancel.");
    }
  };

  return (
    <div className="space-y-2">
      {run?.status === "running" && (
        <button type="button" className={buttonClass} onClick={cancel}>
          <Square className="h-3.5 w-3.5" aria-hidden /> Cancel
        </button>
      )}
      {run?.error && <p className="break-words text-xs text-rose-500">{run.error}</p>}
      <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 font-mono text-xs leading-relaxed">
        {logs.length === 0 ? (
          <p className="text-[var(--muted)]">No log lines yet.</p>
        ) : (
          logs.map((l, i) => (
            <p key={i} className={cn("whitespace-normal break-words", l.level === "warn" && "text-amber-600 dark:text-amber-400", l.level === "error" && "text-rose-500")}>
              <span className="text-[var(--muted)]">{fmtIst(l.at, false).replace(" IST", "")} </span>
              {l.message}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
