import type { Metadata } from "next";
import BackToApps from "@/components/studio/apps/BackToApps";
import ColorTapPanel from "@/components/studio/colortap/ColorTapPanel";

export const metadata: Metadata = { title: "Color Tap" };

/**
 * Studio → Color Tap: deletes the Color Tap game's stale guest accounts, from
 * this tab instead of GitHub Actions. Admin-only like the rest of Studio
 * (layout session check + middleware, noindex).
 */
export default function StudioColorTapPage() {
  return (
    <div className="space-y-6">
      <div>
        <BackToApps />
        <h1 className="font-display text-3xl font-semibold tracking-tight">Color Tap</h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          Deletes the Color Tap game&apos;s stale guest accounts from Firebase Auth.
        </p>
      </div>

      <ColorTapPanel />
    </div>
  );
}
