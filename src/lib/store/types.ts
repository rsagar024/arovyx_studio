/**
 * Row shapes of the site's Firestore collections. They match the old Prisma
 * models field for field, so the import from Postgres is a straight copy and
 * the mappers in lib/validators.ts are unchanged:
 * - category/status are plain strings, validated by Zod enums
 * - tags/techStack/features/screenshots are JSON-encoded string[]
 */

export interface Project {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  category: string; // APP | GAME | PACKAGE | PLUGIN
  tags: string; // JSON string[]
  techStack: string; // JSON string[]
  features: string; // JSON string[]
  status: string; // LIVE | IN_DEVELOPMENT | ARCHIVED
  version: string | null;
  sourceUrl: string;
  demoUrl: string | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  publisher: string | null;
  privacyPolicyUrl: string | null;
  termsAndConditionsUrl: string | null;
  screenshots: string; // JSON string[]
  stars: number | null;
  downloads: number | null;
  isPublished: boolean;
  aiGenerated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

/** Single document `config/site`. `id` stays 1 for API compatibility. */
export interface SiteConfig {
  id: number;
  siteName: string;
  ownerName: string;
  tagline: string;
  bio: string;
  email: string;
  githubUrl: string;
  linkedinUrl: string;
  instagramUrl: string;
  avatarUrl: string;
  resumeUrl: string;
  heroProjectIds: string; // JSON string[]
  featuredProjectIds: string; // JSON string[]
  updatedAt: Date;
}

export interface AiLog {
  id: string;
  url: string;
  action: string; // generate | improve
  success: boolean;
  error: string | null;
  model: string | null;
  createdAt: Date;
}

/** Defaults a new project gets (the old Prisma @default values). */
export const PROJECT_DEFAULTS = {
  longDescription: "",
  category: "APP",
  tags: "[]",
  techStack: "[]",
  features: "[]",
  status: "IN_DEVELOPMENT",
  version: null,
  demoUrl: null,
  imageUrl: null,
  bannerUrl: null,
  publisher: null,
  privacyPolicyUrl: null,
  termsAndConditionsUrl: null,
  screenshots: "[]",
  stars: null,
  downloads: null,
  isPublished: true,
  aiGenerated: true,
} satisfies Partial<Project>;

export const SITE_CONFIG_DEFAULTS: Omit<SiteConfig, "updatedAt"> = {
  id: 1,
  siteName: "Arovyx Studio",
  ownerName: "Arovyx Studio Owner",
  tagline: "Building apps, games, packages & plugins.",
  bio: "",
  email: "",
  githubUrl: "",
  linkedinUrl: "",
  instagramUrl: "",
  avatarUrl: "",
  resumeUrl: "",
  heroProjectIds: "[]",
  featuredProjectIds: "[]",
};
