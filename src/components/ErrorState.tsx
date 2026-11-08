"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Shared body for the route error boundaries. Server errors reach the client
 * with their message stripped in production, so this can't tell a database
 * outage from any other failure. It names the likely cause and offers a retry.
 */
export default function ErrorState({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container-page flex flex-col items-center justify-center py-24 text-center">
      <div className="glass w-full max-w-lg rounded-2xl p-8">
        <p className="micro-label">Temporarily unavailable</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          Something went wrong on our side
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          This page couldn&apos;t load its data, most likely because the database is unreachable
          right now. Please try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Try again
        </button>
        {error.digest && (
          <p className="mt-4 text-[11px] text-[var(--muted)]">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
