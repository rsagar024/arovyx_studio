import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { toProjectDTO } from "@/lib/validators";
import ProjectForm from "@/components/studio/ProjectForm";

export const metadata: Metadata = { title: "Edit project" };

/** Studio → Edit project: the shared ProjectForm with existing values (Phase 6C). */
export default async function StudioEditProjectPage({
  params,
}: {
  params: { id: string };
}) {
  const row = await db.project.findUnique({ where: { id: params.id } });
  if (!row) notFound();
  const project = toProjectDTO(row);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/studio/projects"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] transition-colors hover:text-accent-600 dark:hover:text-accent-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to projects
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          {project.title}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          /{project.slug} · {project.isPublished ? "Live" : "Draft"}
        </p>
      </div>

      <ProjectForm mode="edit" initial={project} projectId={project.id} />
    </div>
  );
}
