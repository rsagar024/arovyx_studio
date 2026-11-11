import "server-only";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/api";
import { listMessages, listProjects, recentAiLogs, type AiLog, type ContactMessage, type Project } from "@/lib/store";

/*
 * What Studio lists (every project, the inbox, recent AI jobs), kept in Next's
 * data cache like the public data in src/lib/projects.ts. Every Studio visit
 * used to re-read them from Firestore, and every read counts on the free plan.
 * Each edit drops its tag at once (revalidatePublicPages, revalidateMessages),
 * so Studio still shows fresh data; the hourly expiry only catches edits made
 * outside the site. The cache stores JSON, so dates are revived on the way out.
 */
const CACHE_SECONDS = 3600;

const cachedProjects = unstable_cache(async () => listProjects(), ["all-projects-v1"], {
  tags: [CACHE_TAGS.projects],
  revalidate: CACHE_SECONDS,
});

const cachedMessages = unstable_cache(async () => listMessages(), ["all-messages-v1"], {
  tags: [CACHE_TAGS.messages],
  revalidate: CACHE_SECONDS,
});

const cachedAiLogs = unstable_cache(async () => recentAiLogs(10), ["recent-ai-logs-v1"], {
  tags: [CACHE_TAGS.ai],
  revalidate: 600,
});

const byDesc = (key: "createdAt" | "updatedAt") => (a: Project, b: Project) => b[key].getTime() - a[key].getTime();

/** Every project, drafts too, newest first by `orderBy`. */
export async function allProjects(orderBy: "createdAt" | "updatedAt" = "createdAt"): Promise<Project[]> {
  return (await cachedProjects())
    .map((p) => ({ ...p, createdAt: new Date(p.createdAt), updatedAt: new Date(p.updatedAt) }))
    .sort(byDesc(orderBy));
}

/** The inbox, newest first, with the unread count (no separate count query). */
export async function inbox(): Promise<{ messages: ContactMessage[]; unread: number }> {
  const messages = (await cachedMessages()).map((m) => ({ ...m, createdAt: new Date(m.createdAt) }));
  return { messages, unread: messages.filter((m) => !m.isRead).length };
}

/** The 10 latest AI jobs (10 minutes old at most). */
export async function latestAiLogs(): Promise<AiLog[]> {
  return (await cachedAiLogs()).map((l) => ({ ...l, createdAt: new Date(l.createdAt) }));
}
