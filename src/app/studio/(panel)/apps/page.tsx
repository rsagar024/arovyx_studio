import type { Metadata } from "next";
import AppsHub from "@/components/studio/apps/AppsHub";

export const metadata: Metadata = { title: "Apps" };

/** Studio → Apps: one card per app, listed in `components/studio/apps/registry.ts`. */
export default function StudioAppsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Apps</h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          Open an app to work on it. Its jobs run while its own page is open, not from here.
        </p>
      </div>

      <AppsHub />
    </div>
  );
}
