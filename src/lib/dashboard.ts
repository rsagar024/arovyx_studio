import { aiLogCounts, countUnreadMessages, listMessages, listProjects, recentAiLogs } from "@/lib/store";
import { CATEGORIES, type Category } from "@/lib/validators";

const AI_WINDOW_DAYS = 30;

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
  const since = new Date(Date.now() - AI_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // One read of every project (a few dozen) feeds the counts and the recent list.
  const [allProjects, recentMessages, unreadCount, aiLogs, aiCounts] = await Promise.all([
    listProjects({ orderBy: "updatedAt" }),
    listMessages(5),
    countUnreadMessages(),
    recentAiLogs(10),
    aiLogCounts(since),
  ]);
  const aiGeneratedCount = allProjects.filter((p) => p.aiGenerated).length;
  const recentProjects = allProjects
    .slice(0, 5)
    .map(({ id, title, slug, category, isPublished, updatedAt }) => ({ id, title, slug, category, isPublished, updatedAt }));

  // Seed every category with zeros so empty ones still render.
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, { published: 0, draft: 0 }])
  ) as Record<Category, CategoryCount>;
  for (const row of allProjects) {
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
