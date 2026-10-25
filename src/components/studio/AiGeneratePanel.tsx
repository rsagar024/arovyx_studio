"use client";

import { useRef, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  Link2,
  Loader2,
  RotateCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { CATEGORY_META, STATUS_META, cn } from "@/lib/utils";
import {
  CATEGORIES,
  type Category,
  type FetchedDataDTO,
  type ProjectDraft,
  type Status,
} from "@/lib/validators";

type Mode = "single" | "bulk";
type CategoryChoice = "AUTO" | Category;

interface GenerateResult {
  url: string;
  project: ProjectDraft;
  source: string;
  sourceLabel: string;
  warnings: string[];
  stars: number | null;
  /** Echoed fetch data — lets Regenerate skip the fetch phase. */
  fetched: FetchedDataDTO;
  /** Non-AUTO category the admin picked, if any. */
  requestedCategory?: Category;
}

type BulkStatus = "queued" | "working" | "saved" | "error";

interface BulkItem {
  url: string;
  status: BulkStatus;
  message?: string;
}

const CATEGORY_CHOICES: Array<{ value: CategoryChoice; label: string }> = [
  { value: "AUTO", label: "Auto (AI decides)" },
  ...CATEGORIES.map((c) => ({
    value: c as CategoryChoice,
    label:
      c === "APP" ? "App" : c === "GAME" ? "Game" : c === "PACKAGE" ? "Package" : "Plugin",
  })),
];

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-accent-500/60 focus:outline-none";

function friendlyError(status: number, fallback: string): string {
  if (status === 401) return "Session expired — unlock the studio again and retry.";
  if (status === 429) return "Rate limited — wait a moment, then retry.";
  if (status === 504) return "The AI request timed out. Retry, or try again shortly.";
  return fallback;
}

async function generateOne(
  url: string,
  category: CategoryChoice
): Promise<GenerateResult> {
  const res = await fetch("/api/admin/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      ...(category === "AUTO" ? {} : { category }),
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    project?: ProjectDraft;
    source?: string;
    sourceLabel?: string;
    warnings?: string[];
    stars?: number | null;
    fetched?: FetchedDataDTO;
  };

  if (!res.ok || !payload.ok || !payload.project || !payload.fetched) {
    throw new Error(friendlyError(res.status, payload.error ?? "Generation failed."));
  }

  return {
    url,
    project: payload.project,
    source: payload.source ?? "html",
    sourceLabel: payload.sourceLabel ?? url,
    warnings: payload.warnings ?? [],
    stars: payload.stars ?? null,
    fetched: payload.fetched,
    ...(category !== "AUTO" ? { requestedCategory: category as Category } : {}),
  };
}

async function saveDraft(result: GenerateResult): Promise<void> {
  const res = await fetch("/api/admin/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...result.project,
      sourceUrl: result.url,
      stars: result.stars,
      isPublished: false,
      aiGenerated: true,
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || !payload.ok) {
    throw new Error(payload.error ?? "Saving the draft failed.");
  }
}

/**
 * AI Auto-Fill panel (spec §6.1) — paste one link (or many) plus a category
 * and run the fetch → NIM → draft pipeline. Bulk mode queues URLs one at a
 * time and saves each result as an unpublished draft project.
 */
export default function AiGeneratePanel({
  onGenerated,
}: {
  onGenerated?: (result: GenerateResult) => void;
}) {
  const [mode, setMode] = useState<Mode>("single");
  const [url, setUrl] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [category, setCategory] = useState<CategoryChoice>("AUTO");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const bulkAbort = useRef(false);

  const urls = bulkText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  function reset() {
    setResult(null);
    setError(null);
  }

  async function runSingle() {
    const target = url.trim();
    if (!target) return toast.error("Paste a link first.");

    setWorking(true);
    setError(null);
    setResult(null);
    try {
      const generated = await generateOne(target, category);
      setResult(generated);
      onGenerated?.(generated);
    } catch (err) {
      setError({
        status: 0,
        message: err instanceof Error ? err.message : "Generation failed.",
      });
    } finally {
      setWorking(false);
    }
  }

  async function onSingleSubmit(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    await runSingle();
  }

  async function runBulk() {
    if (working) return;
    if (urls.length === 0) return toast.error("Paste at least one link.");

    const items: BulkItem[] = urls.map((u) => ({ url: u, status: "queued" }));
    setBulkItems(items);
    setWorking(true);
    setError(null);
    bulkAbort.current = false;

    for (let i = 0; i < urls.length; i++) {
      if (bulkAbort.current) break;
      const target = urls[i]!;
      setBulkItems((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, status: "working" } : item))
      );
      try {
        const generated = await generateOne(target, category);
        await saveDraft(generated);
        setBulkItems((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, status: "saved" } : item))
        );
      } catch (err) {
        setBulkItems((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: "error",
                  message: err instanceof Error ? err.message : "Failed.",
                }
              : item
          )
        );
      }
    }

    setWorking(false);
  }

  const savedCount = bulkItems.filter((i) => i.status === "saved").length;

  return (
    <div className="space-y-5">
      {/* Mode + category row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="inline-flex rounded-lg border border-[var(--border)] p-1" role="tablist" aria-label="Input mode">
          {(
            [
              { value: "single", label: "Single link", icon: Link2 },
              { value: "bulk", label: "Bulk", icon: Layers },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                reset();
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors",
                mode === value
                  ? "bg-accent-400/15 text-accent-600 dark:text-accent-400"
                  : "text-[var(--muted)] hover:text-[var(--fg)]"
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryChoice)}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--fg)] focus:border-accent-500/60 focus:outline-none"
          >
            {CATEGORY_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Input */}
      {mode === "single" ? (
        <form onSubmit={onSingleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo — GitHub, npm, PyPI, itch.io, any URL"
            aria-label="Project link"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={working}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
          >
            {working ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" aria-hidden />
                Generate
              </>
            )}
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            aria-label="Project links, one per line"
            placeholder={"https://github.com/owner/repo-a\nhttps://www.npmjs.com/package/some-pkg\nhttps://itch.io/…"}
            className={cn(inputClass, "resize-y font-mono")}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[var(--muted)]">
              {urls.length} link{urls.length === 1 ? "" : "s"} detected — processed one at a
              time, each saved as a draft project.
            </p>
            <button
              type="button"
              onClick={() => void runBulk()}
              disabled={working}
              className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
            >
              {working ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Processing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Run bulk
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-red-500/40 bg-red-400/10 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error.message}
          </p>
          <button
            type="button"
            onClick={() => void (mode === "single" ? runSingle() : runBulk())}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-400/20 dark:text-red-300"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden />
            Retry
          </button>
        </div>
      )}

      {/* Bulk progress list */}
      {mode === "bulk" && bulkItems.length > 0 && (
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between">
            <p className="micro-label">Bulk progress</p>
            <p className="text-xs text-[var(--muted)]">
              {savedCount}/{bulkItems.length} saved as drafts
            </p>
          </div>
          <ul className="mt-3 space-y-2">
            {bulkItems.map((item, idx) => (
              <li key={`${item.url}-${idx}`} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 shrink-0">
                  {item.status === "queued" && <Clock className="h-4 w-4 text-[var(--muted)]" aria-label="Queued" />}
                  {item.status === "working" && <Loader2 className="h-4 w-4 animate-spin text-accent-500" aria-label="Working" />}
                  {item.status === "saved" && <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Saved" />}
                  {item.status === "error" && <XCircle className="h-4 w-4 text-red-500" aria-label="Failed" />}
                </span>
                <span className="min-w-0 break-all">
                  <span className="text-[var(--fg)]">{item.url}</span>
                  {item.status === "error" && item.message && (
                    <span className="block text-xs text-red-500 dark:text-red-300">{item.message}</span>
                  )}
                  {item.status === "saved" && (
                    <span className="block text-xs text-emerald-600 dark:text-emerald-400">
                      Draft saved — edit it under Projects.
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Single preview */}
      {mode === "single" && result && (
        <div className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="micro-label">Generated preview</p>
            <span className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-micro text-[var(--muted)]">
              source: {result.sourceLabel}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded border px-2 py-0.5 text-[10px] uppercase tracking-micro",
                CATEGORY_META[result.project.category].chip
              )}
            >
              {CATEGORY_META[result.project.category].label}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] uppercase tracking-micro",
                STATUS_META[result.project.status as Status].chip
              )}
            >
              <span
                className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[result.project.status as Status].dot)}
                aria-hidden
              />
              {STATUS_META[result.project.status as Status].label}
            </span>
            {result.project.version && (
              <span className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                v{result.project.version}
              </span>
            )}
            {result.stars !== null && (
              <span className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                ★ {result.stars.toLocaleString()}
              </span>
            )}
          </div>

          <h3 className="mt-3 font-display text-xl font-semibold tracking-tight">
            {result.project.title}
          </h3>
          <p className="mt-1.5 text-sm text-[var(--muted)]">{result.project.shortDescription}</p>

          {result.project.longDescription && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[var(--fg)]/90">
              {result.project.longDescription.length > 600
                ? `${result.project.longDescription.slice(0, 600).trimEnd()}…`
                : result.project.longDescription}
            </p>
          )}

          {result.project.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {result.project.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {result.project.features.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {result.project.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-[var(--fg)]/90">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-500" aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>
          )}

          {result.warnings.length > 0 && (
            <p className="mt-4 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {result.warnings.join(" · ")}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:border-accent-500/40 hover:text-accent-600 dark:hover:text-accent-400"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              Start over
            </button>
            <p className="text-xs text-[var(--muted)]">
              Edit every field and save comes next (Phase 6C).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
