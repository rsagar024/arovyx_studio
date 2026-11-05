"use client";

import { useState } from "react";
import { UserX } from "lucide-react";
import { MIN_DAYS, buttonClass, cardClass, inputClass, labelClass, primaryButtonClass } from "./api";

/** The old `workflow_dispatch` inputs of guest-cleanup.yaml. A dry run by default. */
export default function GuestCleanupForm({
  disabled,
  defaultDays,
  onSubmit,
}: {
  disabled: boolean;
  defaultDays: number;
  onSubmit: (days: number, dryRun: boolean) => Promise<void>;
}) {
  const [days, setDays] = useState(String(defaultDays));
  const [dryRun, setDryRun] = useState(true);
  const [sending, setSending] = useState(false);
  const n = Number(days);
  const valid = Number.isInteger(n) && n >= MIN_DAYS;
  return (
    <section className={cardClass} aria-labelledby="ct-cleanup">
      <p id="ct-cleanup" className="micro-label">
        Run a cleanup
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
          <label className={labelClass} htmlFor="ct-days">
            Inactive for more than (days, ≥ {MIN_DAYS})
          </label>
          <input
            id="ct-days"
            type="number"
            min={MIN_DAYS}
            step={1}
            className={`${inputClass} w-32`}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-invalid={!valid}
          />
        </div>
        <label htmlFor="ct-dry" className="flex cursor-pointer items-center gap-2 text-sm">
          <input id="ct-dry" type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="h-4 w-4 accent-cyan-500" />
          Dry run (count only)
        </label>
        <button type="submit" className={dryRun ? buttonClass : primaryButtonClass} disabled={disabled || sending || !valid}>
          <UserX className="h-4 w-4" aria-hidden /> {dryRun ? "Count stale guests" : "Delete stale guests"}
        </button>
      </form>
    </section>
  );
}
