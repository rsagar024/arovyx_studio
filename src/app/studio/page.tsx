import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/session";
import StudioLoginForm from "@/components/studio/StudioLoginForm";

export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false },
};

/**
 * /studio — the hidden login page (spec §6). Unlinked from the public site;
 * reachable by direct URL or Ctrl+Shift+A. Redirects away when already
 * authenticated, and is excluded from search indexes.
 */
export default async function StudioLoginPage() {
  const session = await getSession();
  if (session) redirect("/studio/overview");

  return (
    <main id="main" tabIndex={-1} className="relative flex min-h-screen items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent-500/40 bg-accent-400/10 text-accent-600 dark:text-accent-400">
            <KeyRound className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">
            Studio access
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Enter the admin key to open the console.
          </p>
        </div>

        <div className="glass rounded-2xl p-6 shadow-glow">
          <StudioLoginForm />
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[var(--muted)]">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Constant-time key check · HTTP-only signed session
        </p>

        <p className="mt-4 text-center text-xs">
          <Link
            href="/"
            className="text-[var(--muted)] underline-offset-4 transition-colors hover:text-accent-600 dark:hover:text-accent-400"
          >
            ← Back to the site
          </Link>
        </p>
      </div>
    </main>
  );
}
