/**
 * The site's own database: Firestore in the `arovyx-studio` Firebase project.
 * It's a named firebase-admin app, so it never collides with the Quiz Master
 * and Color Tap apps, which talk to other Firebase projects.
 *
 * Only the server reads and writes (Admin SDK). Client access is denied by
 * the project's security rules (production mode).
 */
import "server-only";
import { cert, getApp, initializeApp, type App } from "firebase-admin/app";
import { Timestamp, getFirestore, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";

const APP_NAME = "arovyx-site";

export class SiteDbNotConfigured extends Error {
  constructor() {
    super("FIREBASE_SERVICE_ACCOUNT is not set: the site database (Firestore) can't be reached.");
    this.name = "SiteDbNotConfigured";
  }
}

let app: App | null = null;
let db: Firestore | null = null;

function siteApp(): App {
  if (app) return app;
  try {
    app = getApp(APP_NAME);
    return app;
  } catch {
    // not initialised yet
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw && process.env.FIRESTORE_EMULATOR_HOST) {
    // Tests against the local emulator: no credentials needed.
    app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-arovyx" }, APP_NAME);
    return app;
  }
  if (!raw) throw new SiteDbNotConfigured();
  let info: { project_id?: string; client_email?: string; private_key?: string };
  try {
    info = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON (paste the key file on one line)");
  }
  app = initializeApp(
    {
      credential: cert({ projectId: info.project_id, clientEmail: info.client_email, privateKey: info.private_key }),
      projectId: info.project_id,
    },
    APP_NAME
  );
  return app;
}

export function firestore(): Firestore {
  if (db) return db;
  db = getFirestore(siteApp());
  // Optional fields are often `undefined` in patches; skip them instead of throwing.
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

/** Collection names, in one place. */
export const COL = {
  projects: "projects",
  messages: "contactMessages",
  aiLogs: "aiLogs",
  config: "config",
  quizRuns: "quizRuns",
  colorTapRuns: "colorTapRuns",
  locks: "locks",
} as const;

/** Firestore values → plain JS: Timestamps become Dates (deeply). */
export function fromFirestore(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(fromFirestore);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromFirestore(v)]));
  }
  return value;
}

/** A document as a row: its data with Dates, plus `id` (the document id). */
export function toRow<T>(snap: DocumentSnapshot): T {
  return { ...(fromFirestore(snap.data() ?? {}) as object), id: snap.id } as T;
}

/** A document id that sorts by time: Firestore orders equal timestamps by id. */
export function timeId(at: Date, n = 0): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${at.getTime().toString().padStart(13, "0")}-${n.toString().padStart(4, "0")}-${rand}`;
}

let counter = Math.floor(Math.random() * 1296);

/**
 * A new document id in the cuid style the Postgres rows used ("c" + time +
 * counter + random, lowercase base 36, 25 chars). Imported and new ids look
 * alike, and they pass the `z.string().cuid()` checks on project ids (e.g. the
 * home Hero and Featured pickers).
 */
export function newId(): string {
  counter = (counter + 1) % 1296;
  const time = Date.now().toString(36).padStart(8, "0").slice(-8);
  const count = counter.toString(36).padStart(2, "0");
  let rand = "";
  while (rand.length < 14) rand += Math.random().toString(36).slice(2);
  return `c${time}${count}${rand.slice(0, 14)}`;
}
