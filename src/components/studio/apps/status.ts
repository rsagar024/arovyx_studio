/** Turns each app's own status response into the one line its Apps card shows. */
import { fmtIst, type Status as QuizStatus } from "../quizmaster/api";
import type { Status as ColorTapStatus } from "../colortap/api";

export type AppTone = "attention" | "running" | "idle" | "due" | "scheduled";

export interface AppStatus {
  tone: AppTone;
  label: string;
  lastRun: { status: string; at: string } | null;
}

/** Settings a Quiz Master run can't work without (the "required" rows of its StatusCard). */
const QUIZ_REQUIRED_ENV = ["QUIZMASTER_FIREBASE_SERVICE_ACCOUNT", "NVIDIA_NIM_API_KEY"];

export function quizMasterStatus(status: QuizStatus): AppStatus {
  const { env, schedule, activeRuns, lastRun, serverNow } = status;
  const nextRunAt = schedule.nextRunAt;
  const due = !nextRunAt || new Date(nextRunAt).getTime() <= new Date(serverNow).getTime();
  return {
    ...(!env.modelsOk || QUIZ_REQUIRED_ENV.some((key) => !env[key])
      ? { tone: "attention" as const, label: "Needs attention" }
      : activeRuns.length > 0
        ? { tone: "running" as const, label: "Running" }
        : schedule.paused
          ? { tone: "idle" as const, label: "Paused" }
          : due
            ? { tone: "due" as const, label: "Due now" }
            : { tone: "scheduled" as const, label: `Next run ${fmtIst(nextRunAt)}` }),
    lastRun: lastRun ? { status: lastRun.status, at: lastRun.finishedAt ?? lastRun.startedAt } : null,
  };
}

export function colorTapStatus(status: ColorTapStatus): AppStatus {
  const { keyProblem, active, schedule, runs } = status;
  const last = runs.find((run) => run.status !== "running");
  return {
    ...(keyProblem
      ? { tone: "attention" as const, label: "Needs attention" }
      : active
        ? { tone: "running" as const, label: "Running" }
        : !schedule.autoEnabled
          ? { tone: "idle" as const, label: "Auto off" }
          : schedule.due
            ? { tone: "due" as const, label: "Due now" }
            : { tone: "scheduled" as const, label: `Next run ${fmtIst(schedule.nextAutoAt)}` }),
    lastRun: last ? { status: last.status, at: last.finishedAt ?? last.startedAt } : null,
  };
}
