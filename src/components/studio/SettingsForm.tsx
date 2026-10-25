"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Loader2,
  RotateCcw,
  Save,
  UserRound,
} from "lucide-react";
import { CATEGORY_META, cn } from "@/lib/utils";
import type { Category } from "@/lib/validators";

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-accent-500/60 focus:outline-none";
const labelClass = "mb-1.5 block text-xs uppercase tracking-micro text-[var(--muted)]";
const errorClass = "mt-1 block text-xs text-red-500 dark:text-red-300";

export interface SettingsValues {
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
}

type Key = keyof SettingsValues;

export interface HeroOption {
  id: string;
  title: string;
  category: Category;
}

const MAX_HERO = 3;

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

const URL_FIELDS: Key[] = ["githubUrl", "linkedinUrl", "instagramUrl", "avatarUrl", "resumeUrl"];

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function trimAll(values: SettingsValues): SettingsValues {
  const out = { ...values };
  for (const key of Object.keys(out) as Key[]) out[key] = out[key].trim();
  return out;
}

/**
 * Studio → Settings (spec §6D): owner profile, contact & socials, media.
 * Saves the whole SiteConfig via PATCH /api/admin/settings, which
 * revalidates the public pages so changes are live immediately.
 */
export default function SettingsForm({
  initial,
  initialHeroIds,
  heroOptions,
}: {
  initial: SettingsValues;
  /** Saved hero card choices (project ids, in display order). */
  initialHeroIds: string[];
  /** Published projects that can be shown in the hero. */
  heroOptions: HeroOption[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<SettingsValues>(initial);
  const [form, setForm] = useState<SettingsValues>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  // Drop saved choices that are no longer published so they can't block saving.
  const validInitialHero = initialHeroIds.filter((id) => heroOptions.some((o) => o.id === id));
  const [savedHero, setSavedHero] = useState<string[]>(validInitialHero);
  const [heroIds, setHeroIds] = useState<string[]>(validInitialHero);

  const dirty =
    (Object.keys(form) as Key[]).some((key) => form[key] !== saved[key]) || !sameIds(heroIds, savedHero);

  function toggleHero(id: string) {
    setHeroIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_HERO) {
        toast.error(`Pick at most ${MAX_HERO} projects — untick one first.`);
        return prev;
      }
      return [...prev, id];
    });
  }

  function moveHero(id: string, delta: -1 | 1) {
    setHeroIds((prev) => {
      const i = prev.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  const set =
    (key: Key) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
      if (key === "avatarUrl") setAvatarBroken(false);
      setFieldErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    };

  // Warn before closing/leaving the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function reset() {
    setForm(saved);
    setHeroIds(savedHero);
    setFieldErrors({});
    setFormError(null);
    setAvatarBroken(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    // Client-side validation mirroring settingsInputSchema (server re-validates).
    const payload = trimAll(form);
    const errs: Record<string, string> = {};
    if (!payload.siteName) errs.siteName = "Site name is required.";
    if (!payload.ownerName) errs.ownerName = "Owner name is required.";
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))
      errs.email = "Must be a valid email address, or empty.";
    for (const key of URL_FIELDS) {
      if (payload[key] && !isHttpUrl(payload[key]))
        errs[key] = "Must be a valid http(s) URL, or empty.";
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setFormError("Fix the highlighted fields and try again.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, heroProjectIds: heroIds }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        details?: Record<string, string>;
      };

      if (!res.ok || !data.ok) {
        setFieldErrors(data.details ?? {});
        setFormError(data.error ?? "Save failed. Please try again.");
        toast.error(data.error ?? "Save failed.");
        return;
      }

      setSaved(payload);
      setForm(payload);
      setSavedHero(heroIds);
      toast.success("Settings saved — public site updated.");
      router.refresh();
    } catch {
      setFormError("Network error — please try again.");
      toast.error("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  function field(
    key: Key,
    label: string,
    opts: { type?: string; placeholder?: string; maxLength?: number; hint?: string } = {}
  ) {
    const id = `sf-${key}`;
    return (
      <div>
        <label htmlFor={id} className={labelClass}>
          {label}
          {opts.hint && <span className="normal-case tracking-normal"> ({opts.hint})</span>}
        </label>
        <input
          id={id}
          type={opts.type ?? "text"}
          value={form[key]}
          onChange={set(key)}
          placeholder={opts.placeholder}
          maxLength={opts.maxLength}
          aria-invalid={Boolean(fieldErrors[key])}
          className={inputClass}
        />
        {fieldErrors[key] && <span className={errorClass}>{fieldErrors[key]}</span>}
      </div>
    );
  }

  const avatarPreview = isHttpUrl(form.avatarUrl.trim()) && !avatarBroken ? form.avatarUrl.trim() : null;

  return (
    <form onSubmit={save} noValidate className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition-colors hover:text-accent-600 dark:hover:text-accent-400"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          View public site
        </a>
        {dirty && (
          <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-400/10 px-2 py-1 text-[11px] uppercase tracking-micro text-amber-600 dark:text-amber-300">
            Unsaved changes
          </span>
        )}
      </div>

      {formError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-400/10 px-4 py-3 text-sm text-red-600 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {formError}
        </p>
      )}

      <fieldset className="glass space-y-5 rounded-2xl p-5 sm:p-6">
        <legend className="micro-label px-1">Identity</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {field("siteName", "Site name", { maxLength: 80 })}
          {field("ownerName", "Owner name", { maxLength: 80 })}
        </div>
        {field("tagline", "Tagline", { maxLength: 160, hint: "hero & about fallback" })}
        <div>
          <label htmlFor="sf-bio" className={labelClass}>
            Bio
          </label>
          <textarea
            id="sf-bio"
            rows={6}
            value={form.bio}
            onChange={set("bio")}
            maxLength={4000}
            aria-invalid={Boolean(fieldErrors.bio)}
            className={cn(inputClass, "resize-y")}
          />
          <span className="mt-1 block text-right text-[11px] text-[var(--muted)]">
            {form.bio.length}/4000
          </span>
          {fieldErrors.bio && <span className={errorClass}>{fieldErrors.bio}</span>}
        </div>
      </fieldset>

      <fieldset className="glass space-y-5 rounded-2xl p-5 sm:p-6">
        <legend className="micro-label px-1">Contact &amp; socials</legend>
        {field("email", "Email", { type: "email", placeholder: "you@example.com" })}
        <div className="grid gap-5 sm:grid-cols-2">
          {field("githubUrl", "GitHub", { type: "url", placeholder: "https://github.com/…" })}
          {field("linkedinUrl", "LinkedIn", { type: "url", placeholder: "https://linkedin.com/in/…" })}
          {field("instagramUrl", "Instagram", { type: "url", placeholder: "https://instagram.com/…" })}
        </div>
        <p className="text-xs text-[var(--muted)]">Leave a field empty to hide it on the public site.</p>
      </fieldset>

      <fieldset className="glass space-y-5 rounded-2xl p-5 sm:p-6">
        <legend className="micro-label px-1">Media</legend>
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--panel)]">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarPreview}
                alt="Avatar preview"
                className="h-full w-full object-cover"
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              <UserRound className="h-6 w-6 text-[var(--muted)]" aria-hidden />
            )}
          </div>
          <div className="flex-1">
            {field("avatarUrl", "Avatar URL", { type: "url", placeholder: "https://…/avatar.jpg" })}
            {avatarBroken && (
              <span className="mt-1 block text-xs text-amber-600 dark:text-amber-300">
                Image couldn&apos;t be loaded — check the URL.
              </span>
            )}
          </div>
        </div>
        {field("resumeUrl", "Résumé URL", { type: "url", placeholder: "https://…/resume.pdf" })}
      </fieldset>

      <fieldset className="glass space-y-4 rounded-2xl p-5 sm:p-6">
        <legend className="micro-label px-1">Hero showcase</legend>
        <p className="text-sm text-[var(--muted)]">
          Pick up to {MAX_HERO} projects for the floating cards beside the home page title, in order.{" "}
          {heroIds.length === 0 && "None picked — the latest 3 published projects are shown automatically."}
        </p>

        {heroIds.length > 0 && (
          <ol aria-label="Hero order" className="space-y-2">
            {heroIds.map((id, index) => {
              const option = heroOptions.find((o) => o.id === id);
              if (!option) return null;
              return (
                <li
                  key={id}
                  className="flex items-center gap-3 rounded-lg border border-accent-500/30 bg-accent-400/5 px-3 py-2"
                >
                  <span className="w-5 text-center font-display text-sm font-semibold text-accent-600 dark:text-accent-400">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{option.title}</span>
                  <button
                    type="button"
                    onClick={() => moveHero(id, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${option.title} up`}
                    className="rounded p-1 text-[var(--muted)] transition-colors hover:text-[var(--fg)] disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveHero(id, 1)}
                    disabled={index === heroIds.length - 1}
                    aria-label={`Move ${option.title} down`}
                    className="rounded p-1 text-[var(--muted)] transition-colors hover:text-[var(--fg)] disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {heroOptions.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No published projects yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {heroOptions.map((option) => {
              const checked = heroIds.includes(option.id);
              const full = !checked && heroIds.length >= MAX_HERO;
              return (
                <li key={option.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                      checked
                        ? "border-accent-500/40 bg-accent-400/10"
                        : "border-[var(--border)] bg-[var(--panel)] hover:border-accent-500/30",
                      full && "opacity-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleHero(option.id)}
                      className="h-4 w-4 accent-cyan-500"
                    />
                    <span className="min-w-0 flex-1 truncate">{option.title}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-micro",
                        CATEGORY_META[option.category].chip
                      )}
                    >
                      {CATEGORY_META[option.category].label}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {fieldErrors.heroProjectIds && <span className={errorClass}>{fieldErrors.heroProjectIds}</span>}
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--border)] pt-5">
        <button
          type="button"
          onClick={reset}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Reset
        </button>
        <button
          type="submit"
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-6 py-2.5 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" aria-hidden />
              Save settings
            </>
          )}
        </button>
      </div>
    </form>
  );
}
