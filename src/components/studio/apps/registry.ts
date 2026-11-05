/**
 * Every app run from Studio. To add one, give it its own page under
 * `src/app/studio/(panel)/` and add an entry here: the Apps page and the sidebar
 * highlight both read this list.
 */
import { Palette, Timer, type LucideIcon } from "lucide-react";
import { api as colorTapApi, type Status as ColorTapStatus } from "../colortap/api";
import { api as quizMasterApi, type Status as QuizStatus } from "../quizmaster/api";
import { colorTapStatus, quizMasterStatus, type AppStatus } from "./status";

export interface StudioApp {
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Read-only: must never start a job. Leave out for an app with nothing to report. */
  loadStatus?: () => Promise<AppStatus>;
}

export const APPS: StudioApp[] = [
  {
    name: "Quiz Master",
    description: "Question bank, daily quiz, pushes and guest cleanup.",
    href: "/studio/quizmaster",
    icon: Timer,
    loadStatus: async () => quizMasterStatus(await quizMasterApi<QuizStatus>("/schedule")),
  },
  {
    name: "Color Tap",
    description: "Deletes stale guest accounts from Firebase Auth.",
    href: "/studio/colortap",
    icon: Palette,
    loadStatus: async () => colorTapStatus(await colorTapApi<ColorTapStatus>("/status")),
  },
];
