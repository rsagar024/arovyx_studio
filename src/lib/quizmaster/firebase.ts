/**
 * Firebase Admin access for the Quiz Master jobs, as a named app
 * (`"quizmaster"`) so it never clashes with anything else in this project.
 * Port of quizmaster `automation/common/firebase.py` plus the Firestore
 * stores of `question_bank.py` and `daily_quiz/store.py`.
 *
 * Credentials: `QUIZMASTER_FIREBASE_SERVICE_ACCOUNT`, the Admin SDK key JSON
 * on one line (Firestore, FCM, Auth and Remote Config), and optionally
 * `QUIZMASTER_FIREBASE_PROJECT_ID` (defaults to the key's `project_id`).
 * Initialised lazily on first use, Node runtime only.
 */
import "server-only";
import { cert, getApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getRemoteConfig } from "firebase-admin/remote-config";
import type { RemoteConfigParameters } from "./dailyNotify";
import type { GuestUser, UserAdmin } from "./guestCleanup";
import { toFcm, type Messenger, type PushMessage } from "./messenger";
import { COLLECTION, type BankDoc, type BankStore } from "./questionBank";
import { Increment, MAX_BATCH, SERVER_TIME, type Doc, type DocStore, type Write } from "./writes";

const APP_NAME = "quizmaster";

export class FirebaseNotConfigured extends Error {
  constructor() {
    super("Set QUIZMASTER_FIREBASE_SERVICE_ACCOUNT (the Firebase Admin SDK key JSON on one line)");
    this.name = "FirebaseNotConfigured";
  }
}

export function firebaseConfigured(): boolean {
  return Boolean(process.env.QUIZMASTER_FIREBASE_SERVICE_ACCOUNT);
}

let app: App | null = null;

export function quizApp(): App {
  if (app) return app;
  try {
    app = getApp(APP_NAME);
    return app;
  } catch {
    // not initialised yet
  }
  const raw = process.env.QUIZMASTER_FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new FirebaseNotConfigured();
  let info: { project_id?: string; client_email?: string; private_key?: string };
  try {
    info = JSON.parse(raw);
  } catch {
    throw new Error("QUIZMASTER_FIREBASE_SERVICE_ACCOUNT is not valid JSON (paste the key file on one line)");
  }
  const projectId = process.env.QUIZMASTER_FIREBASE_PROJECT_ID || info.project_id;
  app = initializeApp(
    {
      credential: cert({
        projectId: info.project_id,
        clientEmail: info.client_email,
        privateKey: info.private_key,
      }),
      ...(projectId ? { projectId } : {}),
    },
    APP_NAME
  );
  return app;
}

export const firestore = (): Firestore => getFirestore(quizApp());

/** Firestore values → plain JS: Timestamps become Dates, Bytes Buffers. */
function fromFirestore(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value as Uint8Array);
  if (Array.isArray(value)) return value.map(fromFirestore);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromFirestore(v)]));
  }
  return value;
}

function toFirestore(value: unknown): unknown {
  if (value === SERVER_TIME) return FieldValue.serverTimestamp();
  if (value instanceof Increment) return FieldValue.increment(value.by);
  if (Array.isArray(value)) return value.map(toFirestore);
  if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toFirestore(v)]));
  }
  return value;
}

export class FirestoreBankStore implements BankStore {
  constructor(private db: Firestore = firestore()) {}

  async get(docId: string): Promise<BankDoc | null> {
    const snap = await this.db.collection(COLLECTION).doc(docId).get();
    return snap.exists ? fromDict(docId, snap.data() ?? {}) : null;
  }

  async put(doc: BankDoc): Promise<void> {
    await this.db.collection(COLLECTION).doc(doc.id).set({
      category: doc.category,
      period: doc.period,
      count: doc.count,
      md5: doc.md5,
      data: doc.data,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async listMeta(): Promise<BankDoc[]> {
    // `select` leaves the blobs on the server.
    const snap = await this.db.collection(COLLECTION).select("category", "period", "count", "md5").get();
    return snap.docs.map((d) => fromDict(d.id, d.data())).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  async delete(docId: string): Promise<void> {
    await this.db.collection(COLLECTION).doc(docId).delete();
  }
}

function fromDict(id: string, data: Record<string, unknown>): BankDoc {
  const raw = data.data as Uint8Array | Buffer | undefined;
  return {
    id,
    category: (data.category as string) ?? "",
    period: (data.period as string) ?? "",
    count: Number(data.count ?? 0),
    md5: (data.md5 as string) ?? "",
    data: raw ? Buffer.from(raw) : Buffer.alloc(0),
  };
}

export class FirestoreDocStore implements DocStore {
  constructor(private db: Firestore = firestore()) {}

  async read(path: string): Promise<Doc | null> {
    const snap = await this.db.doc(path).get();
    return snap.exists ? (fromFirestore(snap.data()) as Doc) : null;
  }

  async commit(writes: Write[]): Promise<void> {
    if (writes.length > MAX_BATCH) throw new Error(`${writes.length} writes is over Firestore's batch limit`);
    const batch = this.db.batch();
    for (const w of writes) {
      const ref = this.db.doc(w.path);
      if (w.op === "delete") batch.delete(ref);
      else if (w.op === "create") batch.create(ref, toFirestore(w.data) as Doc);
      else batch.set(ref, toFirestore(w.data) as Doc, { merge: w.op === "merge" });
    }
    await batch.commit();
  }

  async usedGroupIds(category: string): Promise<Set<string>> {
    const snap = await this.db.collection("daily_challenges").where("category", "==", category).get();
    const used = new Set<string>();
    for (const doc of snap.docs) for (const id of (doc.get("groupIds") as string[] | undefined) ?? []) used.add(id);
    return used;
  }

  async weekPlayed(week: string): Promise<boolean> {
    const snap = await this.db.collection("scores").where("weekKey", "==", week).limit(1).get();
    return !snap.empty;
  }
}

export class FcmMessenger implements Messenger {
  async send(message: PushMessage, opts: { dryRun?: boolean } = {}): Promise<string> {
    // A dry run makes FCM validate the message without delivering it.
    return getMessaging(quizApp()).send(toFcm(message), Boolean(opts.dryRun));
  }
}

export class FirebaseUserAdmin implements UserAdmin {
  async listUsers(maxResults: number, pageToken?: string) {
    const result = await getAuth(quizApp()).listUsers(maxResults, pageToken);
    const ms = (s?: string | null) => (s ? Date.parse(s) || null : null);
    const users: GuestUser[] = result.users.map((u) => ({
      uid: u.uid,
      providerData: u.providerData ?? [],
      email: u.email ?? null,
      phoneNumber: u.phoneNumber ?? null,
      createdMs: ms(u.metadata.creationTime),
      lastSignInMs: ms(u.metadata.lastSignInTime),
      lastRefreshMs: ms(u.metadata.lastRefreshTime),
    }));
    return { users, pageToken: result.pageToken };
  }

  async deleteUsers(uids: string[]) {
    const result = await getAuth(quizApp()).deleteUsers(uids);
    return { successCount: result.successCount, failureCount: result.failureCount };
  }
}

/** The live Remote Config template's parameters (including grouped ones). */
export async function remoteConfigParameters(): Promise<RemoteConfigParameters> {
  const template = await getRemoteConfig(quizApp()).getTemplate();
  const params: Record<string, unknown> = { ...(template.parameters ?? {}) };
  for (const group of Object.values(template.parameterGroups ?? {})) {
    for (const [key, value] of Object.entries(group.parameters ?? {})) if (!(key in params)) params[key] = value;
  }
  return params as RemoteConfigParameters;
}
