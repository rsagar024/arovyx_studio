/** Client-side types and fetch helpers for Studio → Color Tap. */

export const MIN_DAYS = 30;

export interface Counts {
  scanned: number;
  guests: number;
  stale: number;
  deleted: number;
  failed: number;
}

export interface RunInfo {
  id: string;
  trigger: "timer" | "manual";
  days: number;
  dryRun: boolean;
  status: "running" | "succeeded" | "failed" | "cancelled";
  error: string | null;
  pages: number;
  counts: Counts;
  startedAt: string;
  finishedAt: string | null;
}

export interface Status {
  serverNow: string;
  projectId: string;
  keyProblem: string | null;
  schedule: {
    autoEnabled: boolean;
    days: number;
    lastCleanupAt: string | null;
    nextAutoAt: string | null;
    due: boolean;
  };
  active: RunInfo | null;
  runs: RunInfo[];
}

export interface StartResponse {
  runId: string;
  created: boolean;
  resumed: boolean;
}

export interface TickResponse {
  status: string;
  done: boolean;
  busy?: boolean;
  pages: number;
  counts: Counts;
}

export interface RunDetail {
  run: RunInfo;
  logs: Array<{ at: string; level: string; message: string }>;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: Record<string, string>) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api/admin/colortap${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload.ok) {
    throw new ApiError(payload.error ?? `Request failed (${res.status}).`, res.status, payload.details);
  }
  return payload as T;
}

/** e.g. `Tue 3 Nov, 19:00 IST`. */
export function fmtIst(iso: string | null | undefined, withDate = true): string {
  if (!iso) return "—";
  const opts: Intl.DateTimeFormatOptions = withDate
    ? { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }
    : { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
  return `${new Intl.DateTimeFormat("en-IN", opts).format(new Date(iso))} IST`;
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

export const STATUS_STYLE: Record<string, string> = {
  running: "border-accent-500/40 text-accent-600 dark:text-accent-400",
  succeeded: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  failed: "border-rose-500/40 text-rose-600 dark:text-rose-400",
  cancelled: "border-[var(--border)] text-[var(--muted)]",
};

export const labelClass = "mb-1.5 block text-xs font-medium text-[var(--muted)]";
export const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-accent-500/60 focus:outline-none";
export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3.5 py-2 text-sm text-[var(--fg)] transition-colors hover:border-accent-500/50 disabled:cursor-not-allowed disabled:opacity-50";
export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50";
export const cardClass = "glass rounded-2xl p-5 sm:p-6";
