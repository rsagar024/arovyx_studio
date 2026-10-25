import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import AdminProjectsList from "@/components/studio/AdminProjectsList";

export const metadata: Metadata = { title: "Projects" };

/** Studio → Projects: full CRUD list (Phase 6A). */
export default function StudioProjectsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            List, edit, publish and delete projects.
          </p>
        </div>
        <Link
          href="/studio/add"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add project
        </Link>
      </div>

      <AdminProjectsList />
    </div>
  );
}
