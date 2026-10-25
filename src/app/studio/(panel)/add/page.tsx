import type { Metadata } from "next";
import StudioAddFlow from "@/components/studio/StudioAddFlow";

export const metadata: Metadata = { title: "Add Project" };

/** Studio → Add Project: AI Auto-Fill → editable preview → save (Phases 6B/6C). */
export default function StudioAddPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Add project</h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          Paste a link and let NVIDIA NIM auto-fill every field — then review, tweak and
          save. Or add the project manually.
        </p>
      </div>

      <StudioAddFlow />
    </div>
  );
}
