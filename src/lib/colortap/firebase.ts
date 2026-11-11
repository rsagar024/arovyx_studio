/**
 * Firebase Admin access for Color Tap's guest cleanup, as a named app
 * (`"colortap"`) so it never clashes with anything else in this project.
 *
 * Credentials: `COLORTAP_FIREBASE_SERVICE_ACCOUNT`, the Admin SDK key JSON on
 * one line, with the Firebase Authentication Admin role. A key for any other
 * project is refused, because this code deletes users.
 * Initialised lazily on first use, Node runtime only.
 */
import "server-only";
import { cert, getApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { configuredFirestore } from "@/lib/firestore";
import type { GuestUser, UserAdmin } from "./guestCleanup";

export const COLORTAP_PROJECT_ID = "color-tap-c06bf";
const APP_NAME = "colortap";
const ENV_NAME = "COLORTAP_FIREBASE_SERVICE_ACCOUNT";

/** Fatal for a run (retrying can't help) and a 503 from the routes. */
export class ColorTapNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ColorTapNotConfigured";
  }
}

interface ServiceAccount {
  type?: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

function parseKey(raw: string | undefined): { key: ServiceAccount } | { problem: string } {
  if (!raw) return { problem: `Set ${ENV_NAME} (the Firebase Admin SDK key JSON on one line).` };
  let key: ServiceAccount | null;
  try {
    key = JSON.parse(raw) as ServiceAccount | null;
  } catch {
    return { problem: `${ENV_NAME} is not valid JSON (paste the key file on one line).` };
  }
  if (key?.type !== "service_account" || !key.private_key || !key.client_email) {
    return { problem: `${ENV_NAME} is not a service-account key.` };
  }
  if (key.project_id !== COLORTAP_PROJECT_ID) {
    return { problem: `${ENV_NAME} is for project ${key.project_id ?? "(none)"}, not ${COLORTAP_PROJECT_ID}.` };
  }
  return { key };
}

/** Why the key can't be used, or null when it can. Never contains the secret. */
export function keyProblem(raw = process.env[ENV_NAME]): string | null {
  const parsed = parseKey(raw);
  return "problem" in parsed ? parsed.problem : null;
}

let app: App | null = null;

function colorTapApp(): App {
  if (app) return app;
  try {
    app = getApp(APP_NAME);
    return app;
  } catch {
    // not initialised yet
  }
  const parsed = parseKey(process.env[ENV_NAME]);
  if ("problem" in parsed) throw new ColorTapNotConfigured(parsed.problem);
  app = initializeApp(
    {
      credential: cert({
        projectId: parsed.key.project_id,
        clientEmail: parsed.key.client_email,
        privateKey: parsed.key.private_key,
      }),
      projectId: COLORTAP_PROJECT_ID,
    },
    APP_NAME
  );
  return app;
}

let db: Firestore | null = null;

/**
 * Color Tap's own Firestore, where Studio keeps its cleanup runs and settings
 * (collections prefixed `studio_`), so they never use the site's quota. Tests
 * against the emulator need no key.
 */
export function colorTapDb(): Firestore {
  if (db) return db;
  let base: App;
  if (!process.env[ENV_NAME] && process.env.FIRESTORE_EMULATOR_HOST) {
    try {
      base = getApp(`${APP_NAME}-emulator`);
    } catch {
      base = initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-arovyx" }, `${APP_NAME}-emulator`);
    }
  } else {
    base = colorTapApp();
  }
  // Configured once per instance, however many chunks load this module (see configuredFirestore).
  db = configuredFirestore(base);
  return db;
}

export const STUDIO_COL = {
  runs: "studio_colorTapRuns",
  locks: "studio_locks",
  config: "studio_config",
} as const;

/** The fields the rules read. Auth gives its times as date strings. */
export function toGuestUser(u: UserRecord): GuestUser {
  const ms = (s?: string | null) => (s ? Date.parse(s) || null : null);
  return {
    uid: u.uid,
    providerData: u.providerData ?? [],
    email: u.email ?? null,
    phoneNumber: u.phoneNumber ?? null,
    createdMs: ms(u.metadata.creationTime),
    lastSignInMs: ms(u.metadata.lastSignInTime),
    lastRefreshMs: ms(u.metadata.lastRefreshTime),
  };
}

export function firebaseUsers(): UserAdmin {
  const auth = getAuth(colorTapApp());
  return {
    async listUsers(maxResults, pageToken) {
      const result = await auth.listUsers(maxResults, pageToken);
      return { users: result.users.map(toGuestUser), pageToken: result.pageToken };
    },
    async deleteUsers(uids) {
      const result = await auth.deleteUsers(uids);
      return { successCount: result.successCount, failureCount: result.failureCount };
    },
  };
}
