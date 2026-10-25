import type { MetadataRoute } from "next";
import { getPublishedProjects } from "@/lib/projects";
import { absoluteUrl } from "@/lib/utils";

/** /sitemap.xml — public pages + every published project (Phase 7.3). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const projects = await getPublishedProjects();
  const latest = projects.reduce<Date>(
    (max, p) => (p.updatedAt > max ? p.updatedAt : max),
    new Date(0)
  );
  const fallback = latest.getTime() > 0 ? latest : new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: fallback, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/projects"), lastModified: fallback, changeFrequency: "weekly", priority: 0.9 },
  ];

  return [
    ...pages,
    ...projects.map((p) => ({
      url: absoluteUrl(`/projects/${p.slug}`),
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
