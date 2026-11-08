/**
 * Firestore for scripts (seed, import): reads FIREBASE_SERVICE_ACCOUNT from the
 * environment or .env.local, like Next.js does. The app's own client in
 * src/lib/firestore.ts is server-only, so scripts can't import it.
 */
import { loadEnvConfig } from "@next/env";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export function scriptFirestore(): Firestore {
  loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const projectId = process.env.GCLOUD_PROJECT || "demo-arovyx";
    console.log(`Firestore emulator: ${process.env.FIRESTORE_EMULATOR_HOST} (${projectId})`);
    const db = getFirestore(initializeApp({ projectId }, "arovyx-script"));
    db.settings({ ignoreUndefinedProperties: true });
    return db;
  }
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set (add the key JSON on one line to .env.local).");
  const info = JSON.parse(raw) as { project_id: string; client_email: string; private_key: string };
  const app = initializeApp(
    { credential: cert({ projectId: info.project_id, clientEmail: info.client_email, privateKey: info.private_key }), projectId: info.project_id },
    "arovyx-script"
  );
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  console.log(`Firestore project: ${info.project_id}`);
  return db;
}
