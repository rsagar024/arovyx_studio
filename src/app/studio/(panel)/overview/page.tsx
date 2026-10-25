import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ExternalLink,
  FolderKanban,
  Inbox,
  Plus,
  Sparkles,
  XCircle,
} from "lucide-react";
import { getDashboardData } from "@/lib/dashboard";
import { CATEGORIES } from "@/lib/validators";
import { CATEGORY_META, cn, formatDate, relativeTime, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

/** "github.com/owner/repo" — host + path, no protocol or trailing slash. */
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

function StatTile({
  label,
  value,
  detail,
  icon: Icon,
  href,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  icon: typeof FolderKanban;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="micro-label">{label}</p>
        <Icon className="h-4 w-4 text-[var(--muted)]" aria-hidden />
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="glass block rounded-2xl p-5 transition-colors hover:border-accent-500/40"
    >
      {body}
    </Link>
  ) : (
    <div className="glass rounded-2xl p-5">{body}</div>
  );
}

function Panel({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="glass rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {href && (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs text-[var(--muted)] transition-colors hover:text-accent-600 dark:hover:text-accent-400"
          >
            {linkLabel}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-[var(--muted)]">{children}</p>;
}

/** Studio → Overview: counts, recent messages and AI job activity (Phase 6E). */
export default async function StudioOverviewPage() {
  const { projects, messages, ai, recentProjects } = await getDashboardData();
  const aiTotal = ai.success + ai.failure;
  const successRate = aiTotal ? Math.round((ai.success / aiTotal) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            Project counts, recent messages and AI job activity.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--muted)] transition-colors hover:border-accent-500/50 hover:text-[var(--fg)]"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            View site
          </a>
          <Link
            href="/studio/add"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add project
          </Link>
        </div>
      </div>

      {/* stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Projects"
          icon={FolderKanban}
          href="/studio/projects"
          value={<span data-stat="projects-total">{projects.total}</span>}
          detail={
            <>
              <span data-stat="projects-live">{projects.published}</span> live ·{" "}
              <span data-stat="projects-drafts">{projects.drafts}</span> drafts
            </>
          }
        />
        <StatTile
          label="Unread messages"
          icon={Inbox}
          href="/studio/messages"
          value={<span data-stat="messages-unread">{messages.unread}</span>}
          detail="Contact-form inbox"
        />
        <StatTile
          label={`AI jobs · ${ai.windowDays}d`}
          icon={Bot}
          value={<span data-stat="ai-jobs">{aiTotal}</span>}
          detail={
            successRate === null
              ? "No AI calls yet"
              : `${successRate}% success · ${ai.failure} failed`
          }
        />
        <StatTile
          label="AI-generated"
          icon={Sparkles}
          value={<span data-stat="projects-ai">{projects.aiGenerated}</span>}
          detail={`of ${projects.total} projects`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* by category */}
        <Panel title="Projects by category" href="/studio/projects" linkLabel="Manage">
          <ul className="space-y-4">
            {CATEGORIES.map((category) => {
              const meta = CATEGORY_META[category];
              const { published, draft } = projects.byCategory[category];
              const total = published + draft;
              const pct = total ? (published / total) * 100 : 0;
              return (
                <li key={category} data-category={category}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-micro",
                        meta.chip
                      )}
                    >
                      {meta.plural}
                    </span>
                    <span className="text-[var(--muted)]">
                      <span className="font-semibold text-[var(--fg)]" data-count="published">
                        {published}
                      </span>{" "}
                      live ·{" "}
                      <span className="font-semibold text-[var(--fg)]" data-count="draft">
                        {draft}
                      </span>{" "}
                      draft
                    </span>
                  </div>
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]"
                    role="img"
                    aria-label={`${meta.plural}: ${published} of ${total} published`}
                  >
                    <div className={cn("h-full rounded-full", meta.dot)} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* recent messages */}
        <Panel title="Recent messages" href="/studio/messages" linkLabel="Open inbox">
          {messages.recent.length === 0 ? (
            <Empty>No messages yet.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {messages.recent.map((m) => (
                <li key={m.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      m.isRead ? "bg-[var(--border)]" : "bg-accent-500 shadow-glow"
                    )}
                    aria-label={m.isRead ? "Read" : "Unread"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className={cn("truncate text-sm", !m.isRead && "font-semibold")}>{m.name}</p>
                      <span className="shrink-0 text-[11px] text-[var(--muted)]">
                        {relativeTime(m.createdAt)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-[var(--muted)]">{m.subject}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* AI jobs */}
        <Panel title="Recent AI jobs" href="/studio/add" linkLabel="New AI job">
          {ai.recent.length === 0 ? (
            <Empty>
              No AI jobs yet —{" "}
              <Link href="/studio/add" className="text-accent-600 hover:underline dark:text-accent-400">
                auto-fill a project
              </Link>
              .
            </Empty>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {ai.recent.map((log) => (
                <li
                  key={log.id}
                  data-ailog={log.id}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  {log.success ? (
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-label="Succeeded"
                    />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500 dark:text-red-400" aria-label="Failed" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm" title={log.url}>
                        {shortUrl(log.url)}
                      </p>
                      <span
                        className="shrink-0 text-[11px] text-[var(--muted)]"
                        title={log.createdAt.toISOString()}
                      >
                        {relativeTime(log.createdAt)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-micro text-[var(--muted)]">
                        {log.action}
                      </span>
                      {log.model && (
                        <span className="truncate text-[11px] text-[var(--muted)]">{log.model}</span>
                      )}
                    </div>
                    {!log.success && log.error && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-300" title={log.error}>
                        {truncate(log.error, 140)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* recently updated */}
        <Panel title="Recently updated" href="/studio/projects" linkLabel="All projects">
          {recentProjects.length === 0 ? (
            <Empty>No projects yet.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {recentProjects.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link
                      href={`/studio/projects/${p.id}/edit`}
                      className="block truncate text-sm font-medium hover:text-accent-600 dark:hover:text-accent-400"
                    >
                      {p.title}
                    </Link>
                    <p className="truncate text-xs text-[var(--muted)]">
                      /{p.slug} · {formatDate(p.updatedAt)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-micro",
                      p.isPublished
                        ? "border-emerald-500/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300"
                        : "border-[var(--border)] bg-[var(--panel)] text-[var(--muted)]"
                    )}
                  >
                    {p.isPublished ? "Live" : "Draft"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
