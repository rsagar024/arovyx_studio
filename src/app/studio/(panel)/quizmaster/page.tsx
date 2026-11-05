import type { Metadata } from "next";
import BackToApps from "@/components/studio/apps/BackToApps";
import QuizMasterPanel from "@/components/studio/quizmaster/QuizMasterPanel";

export const metadata: Metadata = { title: "Quiz Master" };

/**
 * Studio → Quiz Master: the Quiz Master app's server jobs (question bank,
 * daily quiz, pushes, weekly summary, guest cleanup), run from this tab on a
 * countdown instead of GitHub Actions. Admin-only like the rest of Studio
 * (layout session check + middleware, noindex).
 */
export default function StudioQuizMasterPage() {
  return (
    <div className="space-y-6">
      <div>
        <BackToApps />
        <h1 className="font-display text-3xl font-semibold tracking-tight">Quiz Master</h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          The Quiz Master app&apos;s question bank, daily quiz, pushes and guest cleanup, run from here every 11–12
          hours.
        </p>
      </div>

      <QuizMasterPanel />
    </div>
  );
}
