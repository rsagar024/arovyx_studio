/**
 * Quiz categories. Port of quizmaster `automation/common/categories.py`.
 *
 * These lists MUST match `lib/core/constants/category_config.dart` in the
 * quizmaster app (`Categories.free` and `Categories.all`, same order): the
 * daily quiz rotates through the free ones by IST day number exactly like
 * the app's `DailyChallengeService.categoryFor`.
 */
import "server-only";
import { notificationTemplates, type Lang } from "./assets";

export const FREE_CATEGORIES = [
  "general_knowledge",
  "bollywood",
  "cricket",
  "science",
  "indian_culture",
] as const;

export const ALL_CATEGORIES = [
  "general_knowledge",
  "bollywood",
  "cricket",
  "science",
  "history",
  "geography",
  "technology",
  "indian_culture",
  "space",
] as const;

export type Category = (typeof ALL_CATEGORIES)[number];

export function isCategory(value: string): value is Category {
  return (ALL_CATEGORIES as readonly string[]).includes(value);
}

/** Today's category for an IST day number (`ist.dayNumber`). */
export function categoryFor(dayNumber: number): Category {
  const n = FREE_CATEGORIES.length;
  return FREE_CATEGORIES[((dayNumber % n) + n) % n]!;
}

/** The category's display name, e.g. `Indian Culture` or `भारतीय संस्कृति`. */
export function categoryName(category: string, language: Lang = "en"): string {
  const names = notificationTemplates().categories[category];
  if (!names) throw new Error(`unknown category ${category}`);
  return names[language];
}
