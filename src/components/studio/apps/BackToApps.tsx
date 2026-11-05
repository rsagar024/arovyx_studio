import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** The way back to the Apps page, shown above each app's heading. */
export default function BackToApps() {
  return (
    <Link
      href="/studio/apps"
      className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--muted)] transition-colors hover:text-accent-600 dark:hover:text-accent-400"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      All apps
    </Link>
  );
}
