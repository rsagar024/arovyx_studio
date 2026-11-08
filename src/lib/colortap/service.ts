/** The Color Tap service the API routes use, on Firestore and the real Color Tap Firebase app. */
import "server-only";
import { createColorTapService } from "./cleanup";
import { firebaseUsers, keyProblem } from "./firebase";
import { FirestoreRunRepo } from "./repo";

export const colorTap = createColorTapService({
  repo: new FirestoreRunRepo(),
  makeUsers: firebaseUsers,
  keyProblem: () => keyProblem(),
});
