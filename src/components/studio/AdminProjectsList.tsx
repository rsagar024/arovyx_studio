"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Archive,
  ExternalLink,
  FolderKanban,
  Loader2,
  Pencil,
  RotateCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { CATEGORY_META, STATUS_META, cn, formatDate } from "@/lib/utils";
import type { ProjectDTO } from "@/lib/validators";

interface ListState {
  status: "loading" | "ready" | "error";
  projects: ProjectDTO[];
}

export default function AdminProjectsList() {
  const [state, setState] = useState<ListState>({ status: "loading", projects: [] });
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/projects");
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        projects?: ProjectDTO[];
        error?: string;
      };
      if (!res.ok || !payload.ok || !payload.projects) {
        throw new Error(payload.error ?? "Failed to load projects");
      }
      setState({ status: "ready", projects: payload.projects });
    } catch (err) {
      setState((prev) => ({
        status: "error",
        projects: prev.projects,
      }));
      toast.error(err instanceof Error ? err.message : "Failed to load projects");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return state.projects;
    return state.projects.filter(
      (p) =>
        p.title.toLowerCase().includes(needle) ||
        p.slug.toLowerCase().includes(needle) ||
        p.category.toLowerCase().includes(needle) ||
        p.tags.some((tag) => tag.toLowerCase().includes(needle))
    );
  }, [state.projects, query]);

  const publishedCount = state.projects.filter((p) => p.isPublished).length;

  async function togglePublished(project: ProjectDTO) {
    setBusyId(project.id);
    try {
      const res = await fetch(`/api/admin/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !project.isPublished }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        project?: ProjectDTO;
      };
      if (!res.ok || !payload.ok || !payload.project) {
        throw new Error(payload.error ?? "Update failed");
      }
      setState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === payload.project!.id ? payload.project! : p
        ),
      }));
      toast.success(
        payload.project.isPublished
          ? `“${payload.project.title}” is live.`
          : `“${payload.project.title}” unpublished.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete(project: ProjectDTO) {
    if (confirmDeleteId !== project.id) {
      setConfirmDeleteId(project.id);
      return;
    }

    setBusyId(project.id);
    try {
      const res = await fetch(`/api/admin/projects/${project.id}`, {
        method: "DELETE",
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "Delete failed");
      setState((prev) => ({
        ...prev,
        projects: prev.projects.filter((p) => p.id !== project.id),
      }));
      toast.success(`“${project.title}” deleted.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="glass flex min-h-[200px] items-center justify-center rounded-2xl">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" aria-label="Loading projects" />
      </div>
    );
  }

  if (state.status === "error" && state.projects.length === 0) {
    return (
      <div className="glass flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-2xl p-10 text-center">
        <p className="text-sm text-[var(--muted)]">Couldn&apos;t load projects.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--fg)] transition-colors hover:border-accent-500/50"
        >
          <RotateCw className="h-4 w-4" aria-hidden />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--muted)]">
          <span className="font-semibold text-[var(--fg)]">{state.projects.length}</span>{" "}
          total ·{" "}
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {publishedCount}
          </span>{" "}
          live ·{" "}
          <span className="font-semibold text-[var(--fg)]">
            {state.projects.length - publishedCount}
          </span>{" "}
          drafts
        </p>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, slug, tag…"
            aria-label="Search projects"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] py-2 pl-9 pr-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-accent-500/60 focus:outline-none"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="glass flex min-h-[200px] flex-col items-center justify-center rounded-2xl p-10 text-center">
          <FolderKanban className="h-6 w-6 text-[var(--muted)]" aria-hidden />
          <p className="mt-3 text-sm text-[var(--muted)]">
            {query ? `No projects match “${query}”.` : "No projects yet."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((project) => {
            const cat = CATEGORY_META[project.category];
            const status = STATUS_META[project.status];
            const busy = busyId === project.id;
            const confirming = confirmDeleteId === project.id;

            return (
              <li
                key={project.id}
                className="glass flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-display text-base font-semibold tracking-tight">
                      {project.title}
                    </h2>
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-micro",
                        cat.chip
                      )}
                    >
                      {cat.label}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-micro",
                        status.chip
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} aria-hidden />
                      {status.label}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-micro",
                        project.isPublished
                          ? "border-emerald-500/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300"
                          : "border-[var(--border)] bg-[var(--panel)] text-[var(--muted)]"
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          project.isPublished ? "bg-emerald-500 dark:bg-emerald-400" : "bg-neutral-400"
                        )}
                        aria-hidden
                      />
                      {project.isPublished ? "Live" : "Draft"}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--muted)]">
                    /{project.slug} · updated {formatDate(project.updatedAt)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void togglePublished(project)}
                    disabled={busy}
                    aria-label={project.isPublished ? `Unpublish ${project.title}` : `Publish ${project.title}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60",
                      project.isPublished
                        ? "border-[var(--border)] text-[var(--muted)] hover:border-amber-500/40 hover:text-amber-600 dark:hover:text-amber-300"
                        : "border-emerald-500/30 bg-emerald-400/10 text-emerald-700 hover:bg-emerald-400/20 dark:text-emerald-300"
                    )}
                  >
                    {project.isPublished ? (
                      <>
                        <Archive className="h-3.5 w-3.5" aria-hidden />
                        Unpublish
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" aria-hidden />
                        Publish
                      </>
                    )}
                  </button>

                  <Link
                    href={`/studio/projects/${project.id}/edit`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:border-accent-500/40 hover:text-accent-600 dark:hover:text-accent-400"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Edit
                  </Link>

                  {project.demoUrl && (
                    <a
                      href={project.demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open demo for ${project.title}`}
                      className="inline-flex items-center rounded-lg border border-[var(--border)] px-2.5 py-2 text-[var(--muted)] transition-colors hover:border-accent-500/40 hover:text-accent-600 dark:hover:text-accent-400"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => void confirmDelete(project)}
                    disabled={busy}
                    aria-label={`Delete ${project.title}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60",
                      confirming
                        ? "border-red-500/50 bg-red-400/10 text-red-600 dark:text-red-300"
                        : "border-[var(--border)] text-[var(--muted)] hover:border-red-500/40 hover:text-red-500 dark:hover:text-red-300"
                    )}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {confirming ? "Confirm delete" : "Delete"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
