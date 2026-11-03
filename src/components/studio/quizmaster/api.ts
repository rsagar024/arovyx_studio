/** Client-side types and fetch helpers for Studio → Quiz Master. */

export interface Progress {
  done: number;
  total: number;
  current: string;
}

export interface RunSummary {
  categories?: Record<string, { status: string; added?: number; doc?: string; error?: string }>;
  steps?: Record<string, { status: string; error?: string; [k: string]: unknown }>;
  current?: string;
  cleanup?: { scanned: number; guests: number; stale: number; deleted: number; failed: number };
}

export interface RunInfo {
  id: string;
  kind: "question_bank" | "guest_cleanup" | "seed";
  trigger: "timer" | "manual";
  slot: string;
  status: "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
  options: Record<string, unknown>;
  summary: RunSummary;
  startedAt: string;
  finishedAt: string | null;
  lockedUntil: string | null;
  tickActive: boolean;
  progress?: Progress;
}

export interface Status {
  serverNow: string;
  schedule: {
    intervalHours: number;
    nextRunAt: string | null;
    nextRunIst: string | null;
    paused: boolean;
    overdue: boolean;
    lastCleanupAt: string | null;
  };
  env: Record<string, boolean> & { models: { generate: string; verify: string; translate: string }; modelsOk: boolean };
  active: (RunInfo & { progress: Progress }) | null;
  activeRuns: Array<RunInfo & { progress: Progress }>;
  lastRun: RunInfo | null;
  runs: RunInfo[];
  categories: string[];
}

export interface TickResponse {
  status: string;
  done: boolean;
  busy?: boolean;
  progress: Progress;
}

export interface RunDetail {
  run: RunInfo;
  progress: Progress;
  steps: Array<{ key: string; order: number; status: string; attempts: number; error: string | null }>;
  logs: Array<{ at: string; level: string; message: string }>;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: Record<string, string>) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api/admin/quizmaster${path}`, {
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

const IST = "Asia/Kolkata";

/** e.g. `Tue 3 Nov, 19:00 IST`. */
export function fmtIst(iso: string | null | undefined, withDate = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = withDate
    ? { timeZone: IST, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }
    : { timeZone: IST, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
  return `${new Intl.DateTimeFormat("en-IN", opts).format(d)} IST`;
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
}

/** `hh:mm:ss`. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** The next 07:00 IST from now, as an ISO string. */
export function nextSevenIst(now = Date.now()): string {
  const offset = 330 * 60_000;
  const local = new Date(now + offset);
  let target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 7, 0) - offset;
  if (target <= now) target += 24 * 3_600_000;
  return new Date(target).toISOString();
}

/** A `datetime-local` value read as IST → ISO. */
export function istInputToIso(value: string): string {
  return new Date(`${value}:00+05:30`).toISOString();
}

export const KIND_LABEL: Record<RunInfo["kind"], string> = {
  question_bank: "Question bank",
  guest_cleanup: "Guest cleanup",
  seed: "Seed",
};

export const STATUS_STYLE: Record<string, string> = {
  running: "border-accent-500/40 text-accent-600 dark:text-accent-400",
  succeeded: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  partial: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  failed: "border-rose-500/40 text-rose-600 dark:text-rose-400",
  cancelled: "border-[var(--border)] text-[var(--muted)]",
  queued: "border-[var(--border)] text-[var(--muted)]",
};

export const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-accent-500/60 focus:outline-none";
export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3.5 py-2 text-sm text-[var(--fg)] transition-colors hover:border-accent-500/50 disabled:cursor-not-allowed disabled:opacity-50";
export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50";
export const cardClass = "glass rounded-2xl p-5 sm:p-6";
