"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";

/**
 * Client form for POST /api/admin/login (spec §6).
 * Shows inline error states for invalid keys, rate limiting and network
 * failures; on success navigates into the panel.
 */
export default function StudioLoginForm() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!key.trim()) {
      setError("Enter the admin key.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(payload.error ?? "Invalid admin key.");
        return;
      }

      router.push("/studio/overview");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div>
        <label
          htmlFor="studio-key"
          className="mb-1.5 block text-xs uppercase tracking-micro text-[var(--muted)]"
        >
          Admin key
        </label>
        <input
          id="studio-key"
          name="key"
          type="password"
          autoComplete="off"
          autoFocus
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="••••••••••••"
          aria-invalid={error !== null}
          aria-describedby={error ? "studio-key-error" : undefined}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-accent-500/60 focus:outline-none"
        />
      </div>

      {error && (
        <p
          id="studio-key-error"
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-400/10 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent-500 px-5 py-3 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Verifying…
          </>
        ) : (
          <>
            <KeyRound className="h-4 w-4" aria-hidden />
            Unlock studio
          </>
        )}
      </button>
    </form>
  );
}
