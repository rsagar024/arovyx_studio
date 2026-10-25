import { db } from "@/lib/db";
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

  const [
    grouped,
    aiGeneratedCount,
    recentMessages,
    unreadCount,
    recentAiLogs,
    aiSuccess,
    aiFailure,
    recentProjects,
  ] = await Promise.all([
    db.project.groupBy({ by: ["category", "isPublished"], _count: true }),
    db.project.count({ where: { aiGenerated: true } }),
    db.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    db.contactMessage.count({ where: { isRead: false } }),
    db.aiLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    db.aiLog.count({ where: { success: true, createdAt: { gte: since } } }),
    db.aiLog.count({ where: { success: false, createdAt: { gte: since } } }),
    db.project.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, title: true, slug: true, category: true, isPublished: true, updatedAt: true },
    }),
  ]);

  // Seed every category with zeros so empty ones still render.
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, { published: 0, draft: 0 }])
  ) as Record<Category, CategoryCount>;
  for (const row of grouped) {
    const bucket = byCategory[row.category as Category];
    if (!bucket) continue; // unknown category string — ignore
    if (row.isPublished) bucket.published += row._count;
    else bucket.draft += row._count;
  }

  const published = CATEGORIES.reduce((sum, c) => sum + byCategory[c].published, 0);
  const drafts = CATEGORIES.reduce((sum, c) => sum + byCategory[c].draft, 0);

  return {
    projects: { total: published + drafts, published, drafts, aiGenerated: aiGeneratedCount, byCategory },
    messages: { recent: recentMessages, unread: unreadCount },
    ai: {
      recent: recentAiLogs,
      windowDays: AI_WINDOW_DAYS,
      success: aiSuccess,
      failure: aiFailure,
    },
    recentProjects,
  };
}
