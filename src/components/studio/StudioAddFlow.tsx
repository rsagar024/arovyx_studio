"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import AiGeneratePanel from "@/components/studio/AiGeneratePanel";
import ProjectForm, { type AiContext, type ProjectFormInitial } from "@/components/studio/ProjectForm";

/**
 * /studio/add flow (spec §6C): start on the AI generator; a generated draft
 * opens the editable ProjectForm (prefilled, with Regenerate available).
 * "Add manually" opens the same form empty (aiGenerated: false).
 */
export default function StudioAddFlow() {
  const [view, setView] = useState<"panel" | "form">("panel");
  const [draft, setDraft] = useState<ProjectFormInitial | null>(null);
  const [ai, setAi] = useState<AiContext | null>(null);
  const [formKey, setFormKey] = useState(0);

  function openForm(nextDraft: ProjectFormInitial | null, nextAi: AiContext | null) {
    setDraft(nextDraft);
    setAi(nextAi);
    setFormKey((k) => k + 1);
    setView("form");
  }

  if (view === "panel") {
    return (
      <div className="space-y-5">
        <AiGeneratePanel
          onGenerated={(result) =>
            openForm(
              {
                ...result.project,
                // not part of the AI draft — carried over from the fetch
                stars: result.stars,
                downloads: result.fetched.downloads ?? null,
              },
              {
              url: result.url,
              fetched: result.fetched,
              ...(result.requestedCategory ? { requestedCategory: result.requestedCategory } : {}),
              }
            )
          }
        />
        <div className="flex items-center gap-3 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            onClick={() => openForm(null, null)}
            className="inline-flex items-center gap-2 text-sm text-[var(--muted)] transition-colors hover:text-accent-600 dark:hover:text-accent-400"
          >
            <PenLine className="h-4 w-4" aria-hidden />
            Skip the AI — add the project manually
          </button>
        </div>
      </div>
    );
  }

  return (
    <ProjectForm
      key={formKey}
      mode="create"
      initial={draft ?? undefined}
      ai={ai}
      onBack={() => setView("panel")}
    />
  );
}
