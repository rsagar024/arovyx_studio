"use client";

import toast from "react-hot-toast";
import { ArrowDown, ArrowUp } from "lucide-react";
import { CATEGORY_META, cn } from "@/lib/utils";
import type { Category } from "@/lib/validators";

export interface PickerOption {
  id: string;
  title: string;
  category: Category;
}

/**
 * Ordered multi-select of published projects (Studio → Settings): tick up
 * to `max`, reorder the picks with ▲/▼. Controlled — the parent owns `value`.
 */
export default function ProjectPicker({
  legend,
  description,
  fallbackHint,
  max,
  options,
  value,
  onChange,
  error,
}: {
  legend: string;
  description: string;
  /** Shown when nothing is picked (what the site does instead). */
  fallbackHint: string;
  max: number;
  options: PickerOption[];
  /** Picked project ids, in display order. */
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}) {
  function toggle(id: string) {
    if (value.includes(id)) return onChange(value.filter((x) => x !== id));
    if (value.length >= max) {
      toast.error(`Pick at most ${max} projects — untick one first.`);
      return;
    }
    onChange([...value, id]);
  }

  function move(id: string, delta: -1 | 1) {
    const i = value.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  }

  return (
    <fieldset className="glass space-y-4 rounded-2xl p-5 sm:p-6">
      <legend className="micro-label px-1">{legend}</legend>
      <p className="text-sm text-[var(--muted)]">
        {description} {value.length === 0 && fallbackHint}
      </p>

      {value.length > 0 && (
        <ol aria-label={`${legend} order`} className="space-y-2">
          {value.map((id, index) => {
            const option = options.find((o) => o.id === id);
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
                  onClick={() => move(id, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${option.title} up`}
                  className="rounded p-1 text-[var(--muted)] transition-colors hover:text-[var(--fg)] disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  disabled={index === value.length - 1}
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

      {options.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No published projects yet.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {options.map((option) => {
            const checked = value.includes(option.id);
            const full = !checked && value.length >= max;
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
                    onChange={() => toggle(option.id)}
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
      {error && <span className="mt-1 block text-xs text-red-500 dark:text-red-300">{error}</span>}
    </fieldset>
  );
}
