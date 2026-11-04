"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ChevronRight, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  KIND_LABEL,
  STATUS_STYLE,
  api,
  buttonClass,
  cardClass,
  fmtDuration,
  fmtIst,
  type RunDetail,
  type RunInfo,
} from "./api";

function StatusPill({ status }: { status: string }) {
  return <span className={cn("rounded-full border px-2 py-0.5 text-xs", STATUS_STYLE[status])}>{status}</span>;
}

export default function RunHistory({ runs, onChanged }: { runs: RunInfo[]; onChanged: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section className={cardClass} aria-labelledby="qm-history">
      <p id="qm-history" className="micro-label">
        Run history
      </p>
      {runs.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">No runs yet.</p>
      ) : (
        <div className="mt-3 -mx-2 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-xs text-[var(--muted)]">
              <tr>
                <th className="px-2 py-2 font-medium">Started</th>
                <th className="px-2 py-2 font-medium">Run</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Took</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="whitespace-nowrap px-2 py-2">{fmtIst(r.startedAt)}</td>
                  <td className="px-2 py-2">
                    {KIND_LABEL[r.kind]}
                    {r.slot ? <code className="ml-1.5 text-xs text-[var(--muted)]">{r.slot}</code> : null}
                    <span className="ml-1.5 text-xs text-[var(--muted)]">
                      {r.trigger}
                      {r.options.dryRun ? " · dry run" : ""}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-[var(--muted)]">
                    {r.finishedAt ? fmtDuration(new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) : "…"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button type="button" className="inline-flex items-center gap-1 text-xs text-accent-600 hover:underline dark:text-accent-400" onClick={() => setOpenId(r.id)}>
                      Details <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openId && <RunDrawer id={openId} onClose={() => setOpenId(null)} onChanged={onChanged} />}
    </section>
  );
}

function RunDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [logs, setLogs] = useState<RunDetail["logs"]>([]);
  const [showSteps, setShowSteps] = useState(false);
  const cursor = useRef<string | null>(null);
  const logBox = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    cursor.current = null;
    setLogs([]);
    const load = async () => {
      try {
        const q = cursor.current ? `?after=${encodeURIComponent(cursor.current)}` : "";
        const d = await api<RunDetail>(`/runs/${id}${q}`);
        if (!alive) return;
        setDetail(d);
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

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const box = logBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [logs.length]);

  const cancel = async () => {
    if (!window.confirm("Cancel this run? Work already saved stays; the rest is skipped.")) return;
    try {
      await api(`/runs/${id}/cancel`, { method: "POST" });
      toast.success("Run cancelled.");
      onChanged();
      setDetail((d) => (d ? { ...d, run: { ...d.run, status: "cancelled" } } : d));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't cancel.");
    }
  };

  const run = detail?.run;
  const cats = Object.entries(run?.summary.categories ?? {});
  const steps = Object.entries(run?.summary.steps ?? {});

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="qm-drawer-title">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-5xl flex-col border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 id="qm-drawer-title" className="truncate font-semibold">
              {run ? `${KIND_LABEL[run.kind]}${run.slot ? ` · ${run.slot}` : ""}` : "Run"}
            </h2>
            <p className="text-xs text-[var(--muted)]">
              {run ? `${fmtIst(run.startedAt)} · ${run.trigger}${run.options.dryRun ? " · dry run" : ""}` : "Loading…"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {run && <StatusPill status={run.status} />}
            {run?.status === "running" && (
              <button type="button" className={buttonClass} onClick={cancel}>
                <Square className="h-3.5 w-3.5" aria-hidden /> Cancel
              </button>
            )}
            <button ref={closeRef} type="button" className="rounded-lg p-2 text-[var(--muted)] hover:text-[var(--fg)]" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          {detail && (
            <>
              {run?.status === "running" && (
                <p className="text-sm">
                  {detail.progress.current || "Waiting for the next tick"} · {detail.progress.done}/{detail.progress.total} steps
                </p>
              )}
              {cats.length > 0 && (
                <div>
                  <h3 className="micro-label">Categories</h3>
                  <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {cats.map(([c, r]) => (
                      <li key={c} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                        <span className="truncate">{c.replace(/_/g, " ")}</span>
                        <span className="flex shrink-0 items-center gap-1.5 text-xs">
                          {r.added ? <span className="text-[var(--muted)]">+{r.added}</span> : null}
                          <StatusPill status={r.status === "published" || r.status === "exists" ? "succeeded" : "failed"} />
                          <span className="text-[var(--muted)]">{r.status}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {steps.length > 0 && (
                <div>
                  <h3 className="micro-label">Steps</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {steps.map(([k, s]) => (
                      <li key={k} className="break-words">
                        <code className="text-xs">{k}</code> · {s.status}
                        {Object.entries(s)
                          .filter(([key]) => !["status", "error"].includes(key))
                          .map(([key, val]) => ` · ${key}: ${String(val)}`)
                          .join("")}
                        {s.error ? <span className="block text-xs text-rose-500">{s.error}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <button type="button" className="text-xs text-accent-600 underline dark:text-accent-400" onClick={() => setShowSteps((x) => !x)}>
                  {showSteps ? "Hide" : "Show"} all {detail.steps.length} step rows
                </button>
                {showSteps && (
                  <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto font-mono text-[11px]">
                    {detail.steps.map((s) => (
                      <li key={s.key} className={cn(s.status === "failed" && "text-rose-500", s.status === "pending" && "text-[var(--muted)]")}>
                        {s.status.padEnd(7)} {s.key}
                        {s.attempts ? ` (attempts ${s.attempts})` : ""}
                        {s.error ? ` — ${s.error}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
          <div>
            <h3 className="micro-label">Log</h3>
            <div ref={logBox} className="mt-2 h-[75vh] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 font-mono text-[13px] leading-relaxed">
              {logs.length === 0 ? (
                <p className="text-[var(--muted)]">No log lines yet.</p>
              ) : (
                logs.map((l, i) => (
                  <p key={i} className={cn("break-words", l.level === "warn" && "text-amber-600 dark:text-amber-400", l.level === "error" && "text-rose-500")}>
                    <span className="text-[var(--muted)]">{fmtIst(l.at, false).replace(" IST", "")} </span>
                    {l.message}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
