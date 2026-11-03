"use client";

import { useState } from "react";
import { Play, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClass, cardClass, inputClass, primaryButtonClass } from "./api";

const label = "mb-1.5 block text-xs font-medium text-[var(--muted)]";

function Check({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-cyan-500" />
      {children}
    </label>
  );
}

export interface ManualRunInput {
  slot: "extra" | "auto" | "am" | "pm";
  date: string;
  force: boolean;
  dryRun: boolean;
  mode: "daily" | "seed";
  confirm: string;
  categories: string[];
}

/** The old `workflow_dispatch` inputs of question-bank.yml, plus a category filter. */
export function ManualRunForm({
  categories,
  disabled,
  onSubmit,
}: {
  categories: string[];
  disabled: boolean;
  onSubmit: (input: ManualRunInput) => Promise<void>;
}) {
  const [v, setV] = useState<ManualRunInput>({
    slot: "extra",
    date: "",
    force: false,
    dryRun: true,
    mode: "daily",
    confirm: "",
    categories: [...categories],
  });
  const [sending, setSending] = useState(false);
  const set = <K extends keyof ManualRunInput>(k: K, value: ManualRunInput[K]) => setV((o) => ({ ...o, [k]: value }));
  const toggleCat = (c: string) =>
    set("categories", v.categories.includes(c) ? v.categories.filter((x) => x !== c) : [...v.categories, c]);

  return (
    <section className={cardClass} aria-labelledby="qm-manual">
      <p id="qm-manual" className="micro-label">
        Manual run
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSending(true);
          try {
            await onSubmit(v);
          } finally {
            setSending(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="qm-mode">
              Mode
            </label>
            <select id="qm-mode" className={inputClass} value={v.mode} onChange={(e) => set("mode", e.target.value as ManualRunInput["mode"])}>
              <option value="daily">daily: generate, publish, quiz, notify</option>
              <option value="seed">seed: write the seed bank, publish</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="qm-slot">
              Slot
            </label>
            <select id="qm-slot" className={inputClass} value={v.slot} onChange={(e) => set("slot", e.target.value as ManualRunInput["slot"])}>
              <option value="extra">extra: its own batch (+45 per category)</option>
              <option value="auto">auto: am before 15:00 IST, else pm</option>
              <option value="am">am</option>
              <option value="pm">pm (no daily quiz)</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="qm-date">
              Date (IST, empty = today)
            </label>
            <input id="qm-date" type="date" className={inputClass} value={v.date} onChange={(e) => set("date", e.target.value)} />
          </div>
        </div>

        {v.mode === "daily" && (
          <fieldset>
            <legend className={label}>Categories</legend>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const on = v.categories.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCat(c)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      on ? "border-accent-500/60 bg-accent-500/10 text-accent-700 dark:text-accent-300" : "border-[var(--border)] text-[var(--muted)]"
                    )}
                  >
                    {c.replace(/_/g, " ")}
                  </button>
                );
              })}
              <button type="button" className="px-2 text-xs text-[var(--muted)] underline" onClick={() => set("categories", v.categories.length ? [] : [...categories])}>
                {v.categories.length ? "none" : "all"}
              </button>
            </div>
          </fieldset>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Check id="qm-dry" checked={v.dryRun} onChange={(x) => set("dryRun", x)}>
            Dry run (log writes and pushes, change nothing)
          </Check>
          <Check id="qm-force" checked={v.force} onChange={(x) => set("force", x)}>
            Force (replace a slot already done; publish/notify after noon)
          </Check>
        </div>

        {v.mode === "seed" && (
          <div>
            <label className={label} htmlFor="qm-confirm">
              Seeding rewrites every <code>base_*</code> doc (generated questions are kept). Type SEED to confirm.
            </label>
            <input id="qm-confirm" className={cn(inputClass, "max-w-xs")} value={v.confirm} onChange={(e) => set("confirm", e.target.value)} autoComplete="off" />
          </div>
        )}

        <button
          type="submit"
          className={primaryButtonClass}
          disabled={disabled || sending || (v.mode === "daily" && !v.categories.length) || (v.mode === "seed" && v.confirm !== "SEED")}
        >
          <Play className="h-4 w-4" aria-hidden /> Start {v.dryRun ? "dry run" : "run"}
        </button>
      </form>
    </section>
  );
}

export function GuestCleanupForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (days: number, dryRun: boolean) => Promise<void> }) {
  const [days, setDays] = useState("30");
  const [dryRun, setDryRun] = useState(true);
  const [sending, setSending] = useState(false);
  const n = Number(days);
  const valid = Number.isInteger(n) && n >= 30;
  return (
    <section className={cardClass} aria-labelledby="qm-cleanup">
      <p id="qm-cleanup" className="micro-label">
        Guest cleanup
      </p>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Deletes anonymous (guest) Firebase Auth users with no activity for more than the given days. Real accounts are
        never touched.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setSending(true);
          try {
            await onSubmit(n, dryRun);
          } finally {
            setSending(false);
          }
        }}
      >
        <div>
          <label className={label} htmlFor="qm-days">
            Inactive for more than (days, ≥ 30)
          </label>
          <input id="qm-days" type="number" min={30} step={1} className={cn(inputClass, "w-32")} value={days} onChange={(e) => setDays(e.target.value)} aria-invalid={!valid} />
        </div>
        <Check id="qm-cleanup-dry" checked={dryRun} onChange={setDryRun}>
          Dry run (count only)
        </Check>
        <button type="submit" className={dryRun ? buttonClass : primaryButtonClass} disabled={disabled || sending || !valid}>
          <UserX className="h-4 w-4" aria-hidden /> {dryRun ? "Count stale guests" : "Delete stale guests"}
        </button>
      </form>
    </section>
  );
}
