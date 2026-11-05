"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { STATUS_STYLE, fmtIst } from "../quizmaster/api";
import { APPS, type StudioApp } from "./registry";
import type { AppStatus, AppTone } from "./status";

const TONE_STYLE: Record<AppTone, string> = {
  attention: "border-rose-500/40 text-rose-600 dark:text-rose-400",
  running: "border-accent-500/40 text-accent-600 dark:text-accent-400",
  idle: "border-[var(--border)] text-[var(--muted)]",
  due: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  scheduled: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
};

const NEUTRAL_BADGE = "border-[var(--border)] text-[var(--muted)]";

type CardState = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; status: AppStatus };

/** Loads one app's status on open and whenever the tab becomes visible again. */
function useAppStatus(app: StudioApp): CardState {
  const [state, setState] = useState<CardState>({ kind: "loading" });
  const { loadStatus } = app;

  useEffect(() => {
    if (!loadStatus) return;
    let latest = 0;
    const load = () => {
      const request = ++latest;
      loadStatus().then(
        (status) => {
          if (request === latest) setState({ kind: "ready", status });
        },
        () => {
          if (request === latest) setState({ kind: "failed" });
        }
      );
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      latest = -1;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadStatus]);

  return state;
}

function Badge({ className, children }: { className: string; children: string }) {
  return <span className={cn("rounded-full border px-2 py-0.5 text-xs", className)}>{children}</span>;
}

function AppCard({ app }: { app: StudioApp }) {
  const state = useAppStatus(app);
  const { icon: Icon } = app;
  const lastRun = state.kind === "ready" ? state.status.lastRun : null;

  return (
    <Link
      href={app.href}
      className="glass flex flex-col rounded-2xl p-5 transition-colors hover:border-accent-500/40 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-accent-600 dark:text-accent-400">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <h2 className="min-w-0 truncate font-display text-lg font-semibold tracking-tight">{app.name}</h2>
      </div>
      <p className="mt-3 flex-1 text-sm text-[var(--muted)]">{app.description}</p>

      {app.loadStatus && (
        <div className="mt-4 space-y-2" aria-live="polite">
          <div>
            {state.kind === "loading" && <Badge className={NEUTRAL_BADGE}>Checking…</Badge>}
            {state.kind === "failed" && <Badge className={NEUTRAL_BADGE}>Status unavailable</Badge>}
            {state.kind === "ready" && <Badge className={TONE_STYLE[state.status.tone]}>{state.status.label}</Badge>}
          </div>
          {state.kind === "ready" && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
              {lastRun ? (
                <>
                  Last run
                  <Badge className={STATUS_STYLE[lastRun.status] ?? NEUTRAL_BADGE}>{lastRun.status}</Badge>
                  {fmtIst(lastRun.at)}
                </>
              ) : (
                "No runs yet"
              )}
            </p>
          )}
        </div>
      )}
    </Link>
  );
}

/** The card grid on Studio → Apps. Only reads status: jobs start from each app's own page. */
export default function AppsHub() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {APPS.map((app) => (
        <AppCard key={app.href} app={app} />
      ))}
    </div>
  );
}
