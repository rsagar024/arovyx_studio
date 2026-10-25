import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SkipLink from "@/components/SkipLink";

// Rendered in the root layout (outside the (public) group), so it brings its own chrome.
export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <SkipLink />
      <Navbar />
      <main
        id="main"
        tabIndex={-1}
        className="container-page relative z-10 flex flex-1 flex-col items-center justify-center py-24 text-center"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent-500/40 bg-accent-400/10 text-accent-600 dark:text-accent-400">
          <Compass className="h-7 w-7" aria-hidden />
        </span>

        <p className="micro-label mt-6">Error 404</p>
        <h1 className="mt-3 font-display text-5xl font-semibold tracking-tight sm:text-6xl">
          Off the map
        </h1>
        <p className="mt-4 max-w-md text-[var(--muted)]">
          This page doesn&apos;t exist — it may have been moved, renamed, or never shipped.
        </p>

        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-3 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to studio
        </Link>
      </main>
      <Footer />
    </div>
  );
}
