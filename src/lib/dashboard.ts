import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/api";
import { allProjects, inbox, latestAiLogs } from "@/lib/adminData";
import { aiLogCounts } from "@/lib/store";
import { CATEGORIES, type Category } from "@/lib/validators";

const AI_WINDOW_DAYS = 30;

/**
 * The 30-day AI success/failure counts read every log in the window, so they
 * are cached for 10 minutes rather than re-read on each Overview visit.
 */
const cachedAiCounts = unstable_cache(
  async () => aiLogCounts(new Date(Date.now() - AI_WINDOW_DAYS * 24 * 60 * 60 * 1000)),
  ["ai-log-counts-v1"],
  { tags: [CACHE_TAGS.ai], revalidate: 600 }
);

export interface CategoryCount {
  published: number;
  draft: number;
}

/**
 * Everything the studio Overview needs (spec §6.3): project counts per
 * category and publish state, recent contact messages, recent AI jobs
 * from `AiLog`, and recently edited projects.
 */
export async function getDashboardData() {
  // All cached (see adminData.ts): an Overview visit usually reads nothing.
  const [projects, mail, aiLogs, aiCounts] = await Promise.all([
    allProjects("updatedAt"),
    inbox(),
    latestAiLogs(),
    cachedAiCounts(),
  ]);
  const recentMessages = mail.messages.slice(0, 5);
  const unreadCount = mail.unread;
  const aiGeneratedCount = projects.filter((p) => p.aiGenerated).length;
  const recentProjects = projects
    .slice(0, 5)
    .map(({ id, title, slug, category, isPublished, updatedAt }) => ({ id, title, slug, category, isPublished, updatedAt }));

  // Seed every category with zeros so empty ones still render.
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, { published: 0, draft: 0 }])
  ) as Record<Category, CategoryCount>;
  for (const row of projects) {
    const bucket = byCategory[row.category as Category];
    if (!bucket) continue; // unknown category string — ignore
    if (row.isPublished) bucket.published += 1;
    else bucket.draft += 1;
  }

  const published = CATEGORIES.reduce((sum, c) => sum + byCategory[c].published, 0);
  const drafts = CATEGORIES.reduce((sum, c) => sum + byCategory[c].draft, 0);

  return {
    projects: { total: published + drafts, published, drafts, aiGenerated: aiGeneratedCount, byCategory },
    messages: { recent: recentMessages, unread: unreadCount },
    ai: {
      recent: aiLogs,
      windowDays: AI_WINDOW_DAYS,
      success: aiCounts.success,
      failure: aiCounts.failure,
    },
    recentProjects,
  };
}
