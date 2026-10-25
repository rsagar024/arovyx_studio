"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  RotateCw,
  Save,
  Wand2,
} from "lucide-react";
import {
  CATEGORIES,
  STATUSES,
  type Category,
  type FetchedDataDTO,
  type ProjectDraft,
  type Status,
} from "@/lib/validators";
import { CATEGORY_META, STATUS_META, cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-accent-500/60 focus:outline-none";
const labelClass = "mb-1.5 block text-xs uppercase tracking-micro text-[var(--muted)]";
const errorClass = "mt-1 block text-xs text-red-500 dark:text-red-300";

/** Form state — everything stored as strings for painless editing. */
interface FormState {
  title: string;
  shortDescription: string;
  longDescription: string;
  category: Category;
  status: Status;
  version: string;
  sourceUrl: string;
  demoUrl: string;
  imageUrl: string;
  stars: string;
  downloads: string;
  tagsText: string;
  techText: string;
  featuresText: string;
  isPublished: boolean;
}

export interface AiContext {
  url: string;
  fetched: FetchedDataDTO;
  requestedCategory?: Category;
}

interface ProjectFormProps {
  mode: "create" | "edit";
  /** AI draft or existing project — arrays are joined into text fields. */
  initial?: Partial<{
    title: string;
    shortDescription: string;
    longDescription: string;
    category: Category;
    status: Status;
    version: string | null;
    sourceUrl: string;
    demoUrl: string | null;
    imageUrl: string | null;
    stars: number | null;
    downloads: number | null;
    tags: string[];
    techStack: string[];
    features: string[];
    isPublished: boolean;
    aiGenerated: boolean;
  }>;
  /** Present in the AI flow — enables Regenerate on the same fetched data. */
  ai?: AiContext | null;
  projectId?: string;
  onBack?: () => void;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const splitCommas = (value: string) =>
  value.split(",").map((s) => s.trim()).filter(Boolean);
const splitLines = (value: string) =>
  value.split("\n").map((s) => s.trim()).filter(Boolean);

function seedToForm(seed?: ProjectFormProps["initial"]): FormState {
  return {
    title: seed?.title ?? "",
    shortDescription: seed?.shortDescription ?? "",
    longDescription: seed?.longDescription ?? "",
    category: seed?.category ?? "APP",
    status: seed?.status ?? "IN_DEVELOPMENT",
    version: seed?.version ?? "",
    sourceUrl: seed?.sourceUrl ?? "",
    demoUrl: seed?.demoUrl ?? "",
    imageUrl: seed?.imageUrl ?? "",
    stars: seed?.stars != null ? String(seed.stars) : "",
    downloads: seed?.downloads != null ? String(seed.downloads) : "",
    tagsText: (seed?.tags ?? []).join(", "),
    techText: (seed?.techStack ?? []).join(", "),
    featuresText: (seed?.features ?? []).join("\n"),
    isPublished: seed?.isPublished ?? true,
  };
}

/**
 * The editable preview form (spec §6C) — every AI-generated field is
 * editable, used identically for AI results, manual adds and edits.
 * Tracks unsaved state (beforeunload + confirm on back) and offers the
 * AI Description Improver plus Regenerate on the original fetched data.
 */
export default function ProjectForm({
  mode,
  initial,
  ai,
  projectId,
  onBack,
}: ProjectFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => seedToForm(initial));
  const [dirty, setDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [improving, setImproving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [extraInstruction, setExtraInstruction] = useState("");

  const set =
    (key: keyof FormState) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => {
      const value =
        event.target.type === "checkbox"
          ? (event.target as HTMLInputElement).checked
          : event.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
      setFieldErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    };

  // Warn before closing/leaving the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function handleBack() {
    if (!onBack) return;
    if (dirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    onBack();
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (saving) return;

    // Client-side validation (server re-validates with Zod).
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Title is required.";
    if (!isHttpUrl(form.sourceUrl.trim()))
      errs.sourceUrl = "Source URL must be a valid http(s) URL.";
    if (form.demoUrl.trim() && !isHttpUrl(form.demoUrl.trim()))
      errs.demoUrl = "Must be a valid http(s) URL, or empty.";
    if (form.imageUrl.trim() && !isHttpUrl(form.imageUrl.trim()))
      errs.imageUrl = "Must be a valid http(s) URL, or empty.";
    if (form.stars && !/^\d+$/.test(form.stars)) errs.stars = "Must be a whole number ≥ 0.";
    if (form.downloads && !/^\d+$/.test(form.downloads))
      errs.downloads = "Must be a whole number ≥ 0.";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setFormError("Fix the highlighted fields and try again.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      shortDescription: form.shortDescription.trim(),
      longDescription: form.longDescription,
      category: form.category,
      status: form.status,
      version: form.version.trim() || null,
      sourceUrl: form.sourceUrl.trim(),
      demoUrl: form.demoUrl.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      stars: form.stars === "" ? null : Number(form.stars),
      downloads: form.downloads === "" ? null : Number(form.downloads),
      tags: splitCommas(form.tagsText),
      techStack: splitCommas(form.techText),
      features: splitLines(form.featuresText),
      isPublished: form.isPublished,
      ...(mode === "create" ? { aiGenerated: Boolean(ai) } : {}),
    };

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(
        mode === "create" ? "/api/admin/projects" : `/api/admin/projects/${projectId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        details?: Record<string, string>;
      };

      if (!res.ok || !data.ok) {
        setFieldErrors(data.details ?? {});
        setFormError(data.error ?? "Save failed. Please try again.");
        toast.error(data.error ?? "Save failed.");
        return;
      }

      setDirty(false);
      toast.success(mode === "create" ? "Project saved." : "Changes saved.");
      if (mode === "create") {
        router.push("/studio/projects");
      }
      router.refresh();
    } catch {
      setFormError("Network error — please try again.");
      toast.error("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function improveDescriptions() {
    if (improving) return;
    setImproving(true);
    try {
      const res = await fetch("/api/admin/ai/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: isHttpUrl(form.sourceUrl.trim())
            ? form.sourceUrl.trim()
            : ai?.url ?? window.location.origin,
          title: form.title.trim() || "Untitled project",
          shortDescription: form.shortDescription.trim(),
          longDescription: form.longDescription.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        shortDescription?: string;
        longDescription?: string;
      };
      if (!res.ok || !data.ok || !data.shortDescription || !data.longDescription) {
        throw new Error(data.error ?? "Improvement failed.");
      }
      setForm((prev) => ({
        ...prev,
        shortDescription: data.shortDescription!,
        longDescription: data.longDescription!,
      }));
      setDirty(true);
      toast.success("Descriptions improved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Improvement failed.");
    } finally {
      setImproving(false);
    }
  }

  async function regenerate() {
    if (!ai || regenerating) return;
    if (dirty && !window.confirm("Regenerate replaces your edits with fresh AI content. Continue?"))
      return;

    setRegenerating(true);
    try {
      const res = await fetch("/api/admin/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: ai.url,
          ...(ai.requestedCategory ? { category: ai.requestedCategory } : {}),
          ...(extraInstruction.trim() ? { extraInstruction: extraInstruction.trim() } : {}),
          fetchedData: ai.fetched,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        project?: ProjectDraft;
      };
      if (!res.ok || !data.ok || !data.project) {
        throw new Error(data.error ?? "Regeneration failed.");
      }
      const draft = data.project;
      setForm((prev) => ({
        ...prev,
        title: draft.title,
        shortDescription: draft.shortDescription,
        longDescription: draft.longDescription,
        category: draft.category,
        status: draft.status,
        version: draft.version ?? "",
        imageUrl: draft.imageUrl ?? "",
        demoUrl: draft.demoUrl ?? "",
        tagsText: draft.tags.join(", "),
        techText: draft.techStack.join(", "),
        featuresText: draft.features.join("\n"),
      }));
      setFieldErrors({});
      setDirty(true);
      toast.success("Regenerated from the same fetched data.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Regeneration failed.");
    } finally {
      setRegenerating(false);
    }
  }

  const improveDisabled =
    improving ||
    !form.shortDescription.trim() ||
    !form.longDescription.trim() ||
    Boolean(fieldErrors.shortDescription || fieldErrors.longDescription);

  return (
    <form onSubmit={save} noValidate className="space-y-6">
      {/* Top row: back + unsaved badge + error banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition-colors hover:text-accent-600 dark:hover:text-accent-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-400/10 px-2 py-1 text-[11px] uppercase tracking-micro text-amber-600 dark:text-amber-300">
              Unsaved changes
            </span>
          )}
          <span
            className={cn(
              "rounded border px-2 py-1 text-[11px] uppercase tracking-micro",
              form.isPublished
                ? "border-emerald-500/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300"
                : "border-[var(--border)] bg-[var(--panel)] text-[var(--muted)]"
            )}
          >
            {form.isPublished ? "Will go live" : "Draft"}
          </span>
        </div>
      </div>

      {formError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-400/10 px-4 py-3 text-sm text-red-600 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {formError}
        </p>
      )}

      {/* Regenerate (AI flow only) */}
      {ai && (
        <div className="glass space-y-3 rounded-xl p-4">
          <p className="micro-label">Regenerate with AI</p>
          <textarea
            value={extraInstruction}
            onChange={(e) => setExtraInstruction(e.target.value)}
            rows={2}
            maxLength={500}
            aria-label="Extra instruction for the AI"
            placeholder="Optional extra instruction — e.g. “make it more playful” or “focus on the performance angle”"
            className={cn(inputClass, "resize-y")}
          />
          <button
            type="button"
            onClick={() => void regenerate()}
            disabled={regenerating}
            className="inline-flex items-center gap-2 rounded-lg border border-accent-500/40 bg-accent-400/10 px-4 py-2 text-sm font-medium text-accent-600 transition-colors hover:bg-accent-400/20 disabled:opacity-60 dark:text-accent-400"
          >
            {regenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Regenerating…
              </>
            ) : (
              <>
                <RotateCw className="h-4 w-4" aria-hidden />
                Regenerate
              </>
            )}
          </button>
          <p className="text-xs text-[var(--muted)]">
            Re-runs the AI on the same fetched content — your link is not re-fetched.
          </p>
        </div>
      )}

      {/* Core fields */}
      <div className="space-y-5">
        <div>
          <label htmlFor="pf-title" className={labelClass}>
            Title
          </label>
          <input
            id="pf-title"
            type="text"
            value={form.title}
            onChange={set("title")}
            maxLength={120}
            aria-invalid={Boolean(fieldErrors.title)}
            className={inputClass}
          />
          {fieldErrors.title && <span className={errorClass}>{fieldErrors.title}</span>}
        </div>

        <div>
          <label htmlFor="pf-short" className={labelClass}>
            Short description <span className="normal-case tracking-normal">(1–2 lines)</span>
          </label>
          <textarea
            id="pf-short"
            rows={2}
            value={form.shortDescription}
            onChange={set("shortDescription")}
            maxLength={300}
            aria-invalid={Boolean(fieldErrors.shortDescription)}
            className={cn(inputClass, "resize-y")}
          />
          <span className="mt-1 block text-right text-[11px] text-[var(--muted)]">
            {form.shortDescription.length}/300
          </span>
          {fieldErrors.shortDescription && (
            <span className={errorClass}>{fieldErrors.shortDescription}</span>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor="pf-long" className="mb-0 text-xs uppercase tracking-micro text-[var(--muted)]">
              Long description <span className="normal-case tracking-normal">(markdown)</span>
            </label>
            <button
              type="button"
              onClick={() => void improveDescriptions()}
              disabled={improveDisabled}
              title={
                improveDisabled
                  ? "Fill in both descriptions first"
                  : "Improve/expand both descriptions while keeping facts accurate"
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent-500/40 bg-accent-400/10 px-3 py-1.5 text-xs font-medium text-accent-600 transition-colors hover:bg-accent-400/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-accent-400"
            >
              {improving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Improving…
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5" aria-hidden />
                  Improve with AI
                </>
              )}
            </button>
          </div>
          <textarea
            id="pf-long"
            rows={12}
            value={form.longDescription}
            onChange={set("longDescription")}
            aria-invalid={Boolean(fieldErrors.longDescription)}
            className={cn(inputClass, "resize-y font-mono text-[13px]")}
          />
          {fieldErrors.longDescription && (
            <span className={errorClass}>{fieldErrors.longDescription}</span>
          )}
        </div>

        <div>
          <label htmlFor="pf-features" className={labelClass}>
            Features <span className="normal-case tracking-normal">(one per line)</span>
          </label>
          <textarea
            id="pf-features"
            rows={6}
            value={form.featuresText}
            onChange={set("featuresText")}
            className={cn(inputClass, "resize-y")}
          />
          {fieldErrors.features && <span className={errorClass}>{fieldErrors.features}</span>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pf-tags" className={labelClass}>
              Tags <span className="normal-case tracking-normal">(comma separated)</span>
            </label>
            <input
              id="pf-tags"
              type="text"
              value={form.tagsText}
              onChange={set("tagsText")}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="pf-tech" className={labelClass}>
              Tech stack <span className="normal-case tracking-normal">(comma separated)</span>
            </label>
            <input
              id="pf-tech"
              type="text"
              value={form.techText}
              onChange={set("techText")}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="pf-category" className={labelClass}>
              Category
            </label>
            <select
              id="pf-category"
              value={form.category}
              onChange={set("category")}
              className={inputClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_META[c].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pf-status" className={labelClass}>
              Status
            </label>
            <select id="pf-status" value={form.status} onChange={set("status")} className={inputClass}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pf-version" className={labelClass}>
              Version
            </label>
            <input
              id="pf-version"
              type="text"
              value={form.version}
              onChange={set("version")}
              placeholder="1.0.0"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pf-source" className={labelClass}>
              Source URL
            </label>
            <input
              id="pf-source"
              type="url"
              value={form.sourceUrl}
              onChange={set("sourceUrl")}
              placeholder="https://github.com/owner/repo"
              aria-invalid={Boolean(fieldErrors.sourceUrl)}
              className={inputClass}
            />
            {fieldErrors.sourceUrl && <span className={errorClass}>{fieldErrors.sourceUrl}</span>}
          </div>
          <div>
            <label htmlFor="pf-demo" className={labelClass}>
              Demo URL <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="pf-demo"
              type="url"
              value={form.demoUrl}
              onChange={set("demoUrl")}
              placeholder="https://…"
              aria-invalid={Boolean(fieldErrors.demoUrl)}
              className={inputClass}
            />
            {fieldErrors.demoUrl && <span className={errorClass}>{fieldErrors.demoUrl}</span>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="pf-image" className={labelClass}>
              Image URL <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="pf-image"
              type="url"
              value={form.imageUrl}
              onChange={set("imageUrl")}
              placeholder="https://…"
              aria-invalid={Boolean(fieldErrors.imageUrl)}
              className={inputClass}
            />
            {fieldErrors.imageUrl && <span className={errorClass}>{fieldErrors.imageUrl}</span>}
          </div>
          <div>
            <label htmlFor="pf-stars" className={labelClass}>
              Stars <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="pf-stars"
              type="number"
              min={0}
              value={form.stars}
              onChange={set("stars")}
              placeholder="—"
              aria-invalid={Boolean(fieldErrors.stars)}
              className={inputClass}
            />
            {fieldErrors.stars && <span className={errorClass}>{fieldErrors.stars}</span>}
          </div>
          <div>
            <label htmlFor="pf-downloads" className={labelClass}>
              Downloads <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="pf-downloads"
              type="number"
              min={0}
              value={form.downloads}
              onChange={set("downloads")}
              placeholder="—"
              aria-invalid={Boolean(fieldErrors.downloads)}
              className={inputClass}
            />
            {fieldErrors.downloads && <span className={errorClass}>{fieldErrors.downloads}</span>}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
          <input
            type="checkbox"
            checked={form.isPublished}
            onChange={set("isPublished")}
            className="h-4 w-4 accent-cyan-500"
          />
          <span className="text-sm">
            <span className="font-medium">Published</span>{" "}
            <span className="text-[var(--muted)]">
              — visible on the public site immediately after saving
            </span>
          </span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--border)] pt-5">
        {onBack && (
          <button
            type="button"
            onClick={handleBack}
            className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-6 py-2.5 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" aria-hidden />
              {mode === "create" ? "Save project" : "Save changes"}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
