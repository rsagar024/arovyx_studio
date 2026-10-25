import type { Category, Status } from "@/lib/validators";

/** Minimal class-name joiner (no external dependency). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** "just now", "5m ago", "3h ago", "2d ago" — falls back to formatDate after a week. */
export function relativeTime(date: Date | string, now = Date.now()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function absoluteUrl(path = ""): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export type SourceKind = "playstore" | "github" | "gitlab" | "npm" | "pypi" | "web";

/** What a project's source link points at — drives the button label and icon. */
export function sourceLinkMeta(url: string | null | undefined): { kind: SourceKind; label: string } {
  let host = "";
  try {
    host = new URL(url ?? "").hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return { kind: "web", label: "Visit" };
  }
  if (host === "play.google.com") return { kind: "playstore", label: "Get it on Google Play" };
  if (host === "github.com") return { kind: "github", label: "View source" };
  if (host === "gitlab.com") return { kind: "gitlab", label: "View source" };
  if (host === "npmjs.com" || host === "npmjs.org") return { kind: "npm", label: "View on npm" };
  if (host === "pypi.org") return { kind: "pypi", label: "View on PyPI" };
  return { kind: "web", label: "Visit" };
}

/** Category display metadata — labels + Tailwind chip classes (one accent per category). */
export const CATEGORY_META: Record<Category, {
  label: string;
  plural: string;
  chip: string;
  accentText: string;
  accentBorder: string;
  dot: string;
  /** Hover/focus border in the category color. */
  hoverBorder: string;
  /** Hover/focus glow in the category color (literal strings for the Tailwind JIT). */
  glow: string;
  /** Gradient start for the card's top accent line. */
  line: string;
}> = {
  APP: {
    label: "App",
    plural: "Apps",
    chip: "bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30 dark:border-cyan-400/30",
    accentText: "text-cyan-700 dark:text-cyan-300",
    accentBorder: "border-cyan-500/30 dark:border-cyan-400/30",
    dot: "bg-cyan-600 dark:bg-cyan-300",
    hoverBorder: "hover:border-cyan-400/50 focus-within:border-cyan-400/50",
    glow: "hover:shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_0_32px_-8px_rgba(34,211,238,0.45)] focus-within:shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_0_32px_-8px_rgba(34,211,238,0.45)]",
    line: "from-cyan-400/70",
  },
  GAME: {
    label: "Game",
    plural: "Games",
    chip: "bg-lime-400/15 text-lime-700 dark:text-lime-300 border-lime-500/30 dark:border-lime-400/30",
    accentText: "text-lime-700 dark:text-lime-300",
    accentBorder: "border-lime-500/30 dark:border-lime-400/30",
    dot: "bg-lime-600 dark:bg-lime-300",
    hoverBorder: "hover:border-lime-400/50 focus-within:border-lime-400/50",
    glow: "hover:shadow-[0_0_0_1px_rgba(163,230,53,0.25),0_0_32px_-8px_rgba(163,230,53,0.45)] focus-within:shadow-[0_0_0_1px_rgba(163,230,53,0.25),0_0_32px_-8px_rgba(163,230,53,0.45)]",
    line: "from-lime-400/70",
  },
  PACKAGE: {
    label: "Package",
    plural: "Packages",
    chip: "bg-violet-400/10 text-violet-700 dark:text-violet-300 border-violet-500/30 dark:border-violet-400/30",
    accentText: "text-violet-700 dark:text-violet-300",
    accentBorder: "border-violet-500/30 dark:border-violet-400/30",
    dot: "bg-violet-600 dark:bg-violet-300",
    hoverBorder: "hover:border-violet-400/50 focus-within:border-violet-400/50",
    glow: "hover:shadow-[0_0_0_1px_rgba(167,139,250,0.25),0_0_32px_-8px_rgba(167,139,250,0.45)] focus-within:shadow-[0_0_0_1px_rgba(167,139,250,0.25),0_0_32px_-8px_rgba(167,139,250,0.45)]",
    line: "from-violet-400/70",
  },
  PLUGIN: {
    label: "Plugin",
    plural: "Plugins",
    chip: "bg-amber-400/15 text-amber-700 dark:text-amber-300 border-amber-500/30 dark:border-amber-400/30",
    accentText: "text-amber-700 dark:text-amber-300",
    accentBorder: "border-amber-500/30 dark:border-amber-400/30",
    dot: "bg-amber-600 dark:bg-amber-300",
    hoverBorder: "hover:border-amber-400/50 focus-within:border-amber-400/50",
    glow: "hover:shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_0_32px_-8px_rgba(251,191,36,0.45)] focus-within:shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_0_32px_-8px_rgba(251,191,36,0.45)]",
    line: "from-amber-400/70",
  },
};

/** Status metadata — labels + status dot colors. */
export const STATUS_META: Record<Status, { label: string; dot: string; chip: string }> = {
  LIVE: {
    label: "Live",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    chip: "bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 dark:border-emerald-400/30",
  },
  IN_DEVELOPMENT: {
    label: "In Development",
    dot: "bg-yellow-500 dark:bg-yellow-400",
    chip: "bg-yellow-400/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30 dark:border-yellow-400/30",
  },
  ARCHIVED: {
    label: "Archived",
    dot: "bg-neutral-400",
    chip: "bg-neutral-400/10 text-neutral-600 dark:text-neutral-300 border-neutral-400/30",
  },
};
