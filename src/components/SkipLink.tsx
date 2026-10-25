/** First focusable element on every page: jumps keyboard users past the nav (Phase 7.4). */
export default function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-ink-950 shadow-glow focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]"
    >
      Skip to content
    </a>
  );
}
