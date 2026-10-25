import type { Metadata } from "next";
import { getSiteConfig } from "@/lib/projects";

/** Default social card, rendered by app/og/route.tsx (1200×630 PNG). */
export const DEFAULT_OG_IMAGE = {
  url: "/og",
  width: 1200,
  height: 630,
  alt: "Arovyx Studio — apps, games, packages & plugins",
};

/**
 * Per-page metadata with a canonical URL and a complete Open Graph /
 * Twitter block. Next replaces (doesn't merge) a page's `openGraph`
 * object with the layout's, so every page builds the full set here.
 * Relative URLs resolve against `metadataBase` from the root layout.
 */
export async function pageMetadata({
  title,
  description,
  path,
  image,
  type = "website",
}: {
  /** Page title; omit for the home page (uses the site name). */
  title?: string;
  description: string;
  path: string;
  /** Absolute image URL; falls back to the default card. */
  image?: string | null;
  type?: "website" | "article";
}): Promise<Metadata> {
  const config = await getSiteConfig();
  const siteName = config.siteName || "Arovyx Studio";
  const fullTitle = title ? `${title} · ${siteName}` : siteName;
  const images = image ? [{ url: image }] : [DEFAULT_OG_IMAGE];

  return {
    ...(title ? { title } : { title: { absolute: siteName } }),
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      siteName,
      locale: "en_US",
      url: path,
      title: fullTitle,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: images.map((img) => img.url),
    },
  };
}
