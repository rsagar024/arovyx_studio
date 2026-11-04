"use client";

import { CheckCircle2, Lock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { KIND_LABEL, STATUS_STYLE, cardClass, fmtIst, type Status } from "./api";

const ENV_KEYS: Array<[string, string]> = [
  ["QUIZMASTER_FIREBASE_SERVICE_ACCOUNT", "required"],
  ["NVIDIA_NIM_API_KEY", "required"],
  ["QUIZMASTER_FIREBASE_PROJECT_ID", "optional"],
  ["QUIZMASTER_GEN_MODEL", "optional"],
  ["QUIZMASTER_VERIFY_MODEL", "optional"],
  ["QUIZMASTER_TRANSLATE_MODEL", "optional"],
  ["NVIDIA_NIM_BASE_URL", "optional"],
];

export default function StatusCard({ status }: { status: Status }) {
  const { env, lastRun, active, schedule } = status;
  return (
    <section className={cardClass} aria-labelledby="qm-status">
      <p id="qm-status" className="micro-label">
        Status
      </p>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold">Settings</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {ENV_KEYS.map(([key, kind]) => {
              const set = Boolean(env[key]);
              return (
                <li key={key} className="flex min-w-0 items-center gap-2">
                  {set ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                  ) : (
                    <XCircle className={cn("h-4 w-4 shrink-0", kind === "required" ? "text-rose-500" : "text-[var(--muted)]")} aria-hidden />
                  )}
                  <code className="truncate text-xs">{key}</code>
                  <span className="ml-auto shrink-0 text-xs text-[var(--muted)]">
                    {set ? "set" : kind === "required" ? "missing" : "default"}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 break-words text-xs text-[var(--muted)]">
            Models: generate <code>{env.models.generate}</code>, verify <code>{env.models.verify}</code>, translate{" "}
            <code>{env.models.translate}</code>
            {env.models.pool?.length ? (
              <span className="mt-1 block">
                If a model is slow or fails, the next is asked too: <code>{env.models.pool.join(" → ")}</code>
              </span>
            ) : null}
            {!env.modelsOk && (
              <span className="mt-1 block text-rose-500">The verifier must be a different model family from the generator.</span>
            )}
          </p>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <h2 className="font-semibold">Last run</h2>
            {lastRun ? (
              <p className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full border px-2 py-0.5 text-xs", STATUS_STYLE[lastRun.status])}>{lastRun.status}</span>
                <span>{KIND_LABEL[lastRun.kind]}</span>
                {lastRun.slot && <code className="text-xs">{lastRun.slot}</code>}
                <span className="text-xs text-[var(--muted)]">{fmtIst(lastRun.finishedAt ?? lastRun.startedAt)}</span>
              </p>
            ) : (
              <p className="mt-1.5 text-[var(--muted)]">No runs yet.</p>
            )}
          </div>
          <div>
            <h2 className="font-semibold">Last guest cleanup</h2>
            <p className="mt-1.5 text-[var(--muted)]">{schedule.lastCleanupAt ? fmtIst(schedule.lastCleanupAt) : "Never (from here)."}</p>
          </div>
          <div>
            <h2 className="flex items-center gap-1.5 font-semibold">
              <Lock className="h-3.5 w-3.5" aria-hidden /> Lock
            </h2>
            {active ? (
              <p className="mt-1.5 text-[var(--muted)]">
                {KIND_LABEL[active.kind]} run <code className="text-xs">{active.id.slice(-8)}</code>
                {active.tickActive ? " · a tick is working now" : ""}
                {active.lockedUntil ? ` · lease until ${fmtIst(active.lockedUntil, false)}` : ""}
              </p>
            ) : (
              <p className="mt-1.5 text-[var(--muted)]">Free.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
