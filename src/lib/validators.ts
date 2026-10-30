import { z } from "zod";
import type { Project } from "@prisma/client";

/* ------------------------------------------------------------------ */
/* Enums (Zod is the source of truth — SQLite has no native enums)    */
/* ------------------------------------------------------------------ */

export const categorySchema = z.enum(["APP", "GAME", "PACKAGE", "PLUGIN"]);
export const statusSchema = z.enum(["LIVE", "IN_DEVELOPMENT", "ARCHIVED"]);

export type Category = z.infer<typeof categorySchema>;
export type Status = z.infer<typeof statusSchema>;

export const CATEGORIES = categorySchema.options;
export const STATUSES = statusSchema.options;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Parse a JSON-encoded string column into a string[] (never throws). */
export function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

const nullableUrl = (schema: z.ZodType<string>) =>
  schema.nullable().or(z.literal("")).transform((v) => v || null);

/* ------------------------------------------------------------------ */
/* Project DTO (arrays as real arrays) + DB mappers                    */
/* ------------------------------------------------------------------ */

export type ProjectDTO = Omit<
  Project,
  "category" | "status" | "tags" | "techStack" | "features" | "screenshots"
> & {
  category: Category;
  status: Status;
  tags: string[];
  techStack: string[];
  features: string[];
  screenshots: string[];
};

/** DB row → application object (decodes JSON columns, validates enums). */
export function toProjectDTO(row: Project): ProjectDTO {
  return {
    ...row,
    category: categorySchema.catch("APP").parse(row.category),
    status: statusSchema.catch("IN_DEVELOPMENT").parse(row.status),
    tags: parseJsonStringArray(row.tags),
    techStack: parseJsonStringArray(row.techStack),
    features: parseJsonStringArray(row.features),
    screenshots: parseJsonStringArray(row.screenshots),
  };
}

/** Application object → DB row shape (encodes arrays as JSON columns). */
export function serializeProject(project: {
  category: Category;
  status: Status;
  tags: string[];
  techStack: string[];
  features: string[];
  /** Encoded only when provided (partial updates leave it untouched). */
  screenshots?: string[];
}) {
  return {
    category: project.category,
    status: project.status,
    tags: JSON.stringify(project.tags),
    techStack: JSON.stringify(project.techStack),
    features: JSON.stringify(project.features),
    ...(project.screenshots !== undefined
      ? { screenshots: JSON.stringify(project.screenshots) }
      : {}),
  };
}

/* ------------------------------------------------------------------ */
/* AI output schema (spec §8) — defensive, every field has a fallback  */
/* ------------------------------------------------------------------ */

export const projectDraftSchema = z.object({
  title: z.string().trim().min(1, "title is required"),
  shortDescription: z.string().catch(""),
  longDescription: z.string().catch(""),
  category: categorySchema.catch("APP"),
  tags: z.array(z.string()).catch([]),
  techStack: z.array(z.string()).catch([]),
  features: z.array(z.string()).catch([]),
  status: statusSchema.catch("IN_DEVELOPMENT"),
  version: nullableUrl(z.string()).catch(null),
  imageUrl: nullableUrl(z.string().url()).catch(null),
  demoUrl: nullableUrl(z.string().url()).catch(null),
  // Media is never invented by the AI — the generate route overlays what the
  // fetcher found (Play Store icon / feature graphic / screenshots).
  bannerUrl: nullableUrl(z.string().url()).catch(null),
  screenshots: z.array(z.string().url()).catch([]),
  publisher: z.string().trim().min(1).max(120).nullable().catch(null),
});

export type ProjectDraft = z.infer<typeof projectDraftSchema>;

/* ------------------------------------------------------------------ */
/* Admin input schemas                                                 */
/* ------------------------------------------------------------------ */

export const projectInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  shortDescription: z.string().trim().max(300).default(""),
  longDescription: z.string().default(""),
  category: categorySchema.default("APP"),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
  techStack: z.array(z.string().trim().min(1)).max(30).default([]),
  features: z.array(z.string().trim().min(1)).max(20).default([]),
  status: statusSchema.default("IN_DEVELOPMENT"),
  version: z.string().trim().max(40).nullable().default(null),
  sourceUrl: z.string().trim().url("Source URL must be a valid URL"),
  demoUrl: nullableUrl(z.string().url()).default(null),
  imageUrl: nullableUrl(z.string().url()).default(null),
  bannerUrl: nullableUrl(z.string().url()).default(null),
  /** Link to the project's privacy policy (optional). */
  privacyPolicyUrl: nullableUrl(z.string().url()).default(null),
  /** Link to the project's terms & conditions (optional). */
  termsAndConditionsUrl: nullableUrl(z.string().url()).default(null),
  /** "Published by" — developer, owner or author. Empty → null. */
  publisher: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .transform((v) => v || null)
    .default(null),
  screenshots: z.array(z.string().trim().url("Each screenshot must be a valid URL")).max(12).default([]),
  stars: z.number().int().nonnegative().nullable().default(null),
  downloads: z.number().int().nonnegative().nullable().default(null),
  isPublished: z.boolean().default(true),
  aiGenerated: z.boolean().default(true),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

/**
 * Partial update schema for PATCH /api/admin/projects/[id].
 * Every field optional; `slug` may be overridden explicitly (uniqueness
 * enforced by the route).
 */
export const projectUpdateSchema = projectInputSchema.partial().extend({
  slug: z.string().trim().min(1).max(140).optional(),
});

export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

export const contactInputSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  email: z.string().trim().email("Invalid email address").max(200),
  subject: z.string().trim().min(2, "Subject is too short").max(150),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(5000),
});

export type ContactInput = z.infer<typeof contactInputSchema>;

export const loginInputSchema = z.object({
  key: z.string().min(1, "Admin key is required"),
});

export const messageUpdateSchema = z.object({
  isRead: z.boolean(),
});

export type MessageUpdate = z.infer<typeof messageUpdateSchema>;

/** Body for DELETE /api/admin/messages (spec §7) — bulk delete by id. */
export const messageBulkDeleteSchema = z.object({
  ids: z.array(z.string().cuid("Invalid message id")).min(1, "Provide at least one id").max(100),
});

export type MessageBulkDelete = z.infer<typeof messageBulkDeleteSchema>;

export const settingsInputSchema = z.object({
  siteName: z.string().trim().min(1).max(80),
  ownerName: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(160),
  bio: z.string().trim().max(4000),
  email: z.string().trim().email().or(z.literal("")),
  githubUrl: z.string().trim().url().or(z.literal("")),
  linkedinUrl: z.string().trim().url().or(z.literal("")),
  instagramUrl: z.string().trim().url().or(z.literal("")),
  avatarUrl: z.string().trim().url().or(z.literal("")),
  resumeUrl: z.string().trim().url().or(z.literal("")),
  /** Up to 3 project ids shown as the home hero cards, in order (empty = latest 3). */
  heroProjectIds: z.array(z.string().cuid("Invalid project id")).max(3, "Pick at most 3 projects"),
  /** Up to 6 project ids for the home "Featured projects" grid, in order (empty = latest 6). */
  featuredProjectIds: z.array(z.string().cuid("Invalid project id")).max(6, "Pick at most 6 projects"),
});

export type SettingsInput = z.infer<typeof settingsInputSchema>;

/* ------------------------------------------------------------------ */
/* AI request schemas (API route bodies)                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Fetched data round-trip (server → client → server on regenerate)    */
/* ------------------------------------------------------------------ */

const nullableStr = z.string().max(100_000).nullable().catch(null);

export const fetchedDataSchema = z.object({
  url: z.string().url(),
  source: z.enum(["github", "gitlab", "npm", "pypi", "playstore", "html"]),
  title: nullableStr,
  description: nullableStr,
  readme: nullableStr,
  topics: z.array(z.string().max(200)).max(50).catch([]),
  languages: z.array(z.string().max(50)).max(50).catch([]),
  stars: z.number().int().nonnegative().nullable().catch(null),
  downloads: z.number().int().nonnegative().nullable().catch(null),
  iconUrl: nullableStr,
  bannerUrl: nullableStr,
  publisher: nullableStr,
  screenshots: z.array(z.string().url().max(2_000)).max(20).catch([]),
  license: nullableStr,
  version: nullableStr,
  repositoryUrl: nullableStr,
  homepage: nullableStr,
  text: z.string().max(20_000).nullable().catch(null),
  meta: z.record(z.string().max(2_000)).catch({}),
  warnings: z.array(z.string().max(500)).max(20).catch([]),
});

export type FetchedDataDTO = z.infer<typeof fetchedDataSchema>;

export const aiGenerateSchema = z.object({
  url: z.string().trim().url("A valid URL is required"),
  category: categorySchema.optional(), // omitted = AUTO (AI decides)
  extraInstruction: z.string().trim().max(500).optional(),
  /**
   * Previously fetched data echoed back by the client so "Regenerate"
   * re-runs the AI on the exact same fetch without hitting the network.
   */
  fetchedData: fetchedDataSchema.optional(),
});

export type AiGenerateInput = z.infer<typeof aiGenerateSchema>;

/* ------------------------------------------------------------------ */
/* AI description improver input (spec §8)                             */
/* ------------------------------------------------------------------ */

export const improveInputSchema = z.object({
  url: z.string().url(),
  title: z.string().trim().min(1, "Title is required").max(200),
  shortDescription: z.string().trim().min(1, "Short description is required").max(1_000),
  longDescription: z.string().trim().min(1, "Long description is required").max(20_000),
});

export type ImproveInput = z.infer<typeof improveInputSchema>;
