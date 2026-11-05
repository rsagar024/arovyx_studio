/** The Color Tap service the API routes use, on Postgres and the real Firebase app. */
import "server-only";
import { db } from "@/lib/db";
import { createColorTapService } from "./cleanup";
import { firebaseUsers, keyProblem } from "./firebase";
import { PrismaRunRepo } from "./repo";

export const colorTap = createColorTapService({
  repo: new PrismaRunRepo(db),
  makeUsers: firebaseUsers,
  keyProblem: () => keyProblem(),
});
