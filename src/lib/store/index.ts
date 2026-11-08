/**
 * The site's data access on Firestore: projects, contact messages, site
 * settings and the AI usage log. Collections are small (dozens of projects,
 * hundreds of messages), so filtering and sorting happen in memory after one
 * read. That keeps every query on single-field indexes, so no composite
 * indexes need deploying.
 */
import "server-only";
import { COL, firestore, newId, toRow } from "@/lib/firestore";
import {
  PROJECT_DEFAULTS,
  SITE_CONFIG_DEFAULTS,
  type AiLog,
  type ContactMessage,
  type Project,
  type SiteConfig,
} from "./types";

export * from "./types";

const byDesc = <T>(key: keyof T) => (a: T, b: T) =>
  (b[key] as unknown as Date).getTime() - (a[key] as unknown as Date).getTime();

/* ------------------------------ Projects ------------------------------ */

export type ProjectInput = Omit<Project, "id" | "createdAt" | "updatedAt" | keyof typeof PROJECT_DEFAULTS> &
  Partial<Pick<Project, keyof typeof PROJECT_DEFAULTS>>;
export type ProjectPatch = Partial<Omit<Project, "id" | "createdAt" | "updatedAt">>;

export class SlugTaken extends Error {
  constructor(slug: string) {
    super(`The slug "${slug}" is already used by another project.`);
    this.name = "SlugTaken";
  }
}

const projects = () => firestore().collection(COL.projects);

export async function listProjects(opts: { publishedOnly?: boolean; orderBy?: "createdAt" | "updatedAt" } = {}) {
  const snap = opts.publishedOnly
    ? await projects().where("isPublished", "==", true).get()
    : await projects().get();
  return snap.docs.map((d) => toRow<Project>(d)).sort(byDesc<Project>(opts.orderBy ?? "createdAt"));
}

export async function getProject(id: string): Promise<Project | null> {
  const snap = await projects().doc(id).get();
  return snap.exists ? toRow<Project>(snap) : null;
}

export async function getProjectBySlugRow(slug: string): Promise<Project | null> {
  const snap = await projects().where("slug", "==", slug).limit(1).get();
  return snap.empty ? null : toRow<Project>(snap.docs[0]!);
}

/** Creates a project. The slug check and the write are one transaction. */
export async function createProject(input: ProjectInput): Promise<Project> {
  const db = firestore();
  const ref = projects().doc(newId());
  const now = new Date();
  const row: Project = { ...PROJECT_DEFAULTS, ...input, id: ref.id, createdAt: now, updatedAt: now };
  await db.runTransaction(async (tx) => {
    const clash = await tx.get(projects().where("slug", "==", row.slug).limit(1));
    if (!clash.empty) throw new SlugTaken(row.slug);
    const { id: _id, ...data } = row;
    tx.create(ref, data);
  });
  return row;
}

/** Updates a project; a changed slug is checked for clashes in the same transaction. */
export async function updateProject(id: string, patch: ProjectPatch): Promise<Project> {
  const db = firestore();
  const ref = projects().doc(id);
  return db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) throw new Error(`Project ${id} not found.`);
    if (patch.slug !== undefined && patch.slug !== current.get("slug")) {
      const clash = await tx.get(projects().where("slug", "==", patch.slug).limit(1));
      if (!clash.empty && clash.docs[0]!.id !== id) throw new SlugTaken(patch.slug);
    }
    const data = { ...patch, updatedAt: new Date() };
    tx.update(ref, data);
    return { ...toRow<Project>(current), ...data };
  });
}

export async function deleteProject(id: string): Promise<void> {
  await projects().doc(id).delete();
}

/* --------------------------- Contact messages -------------------------- */

const messages = () => firestore().collection(COL.messages);

export async function listMessages(limit?: number): Promise<ContactMessage[]> {
  let q = messages().orderBy("createdAt", "desc");
  if (limit) q = q.limit(limit);
  return (await q.get()).docs.map((d) => toRow<ContactMessage>(d));
}

export async function countUnreadMessages(): Promise<number> {
  const snap = await messages().where("isRead", "==", false).count().get();
  return snap.data().count;
}

export async function getMessage(id: string): Promise<ContactMessage | null> {
  const snap = await messages().doc(id).get();
  return snap.exists ? toRow<ContactMessage>(snap) : null;
}

export async function createMessage(input: Pick<ContactMessage, "name" | "email" | "subject" | "message">) {
  const ref = messages().doc(newId());
  const row: ContactMessage = { ...input, id: ref.id, isRead: false, createdAt: new Date() };
  const { id: _id, ...data } = row;
  await ref.create(data);
  return row;
}

export async function updateMessage(id: string, patch: Pick<ContactMessage, "isRead">): Promise<ContactMessage> {
  const ref = messages().doc(id);
  await ref.update(patch);
  return toRow<ContactMessage>(await ref.get());
}

export async function deleteMessage(id: string): Promise<void> {
  await messages().doc(id).delete();
}

/** Deletes the given messages; returns how many existed. */
export async function deleteMessages(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const refs = ids.map((id) => messages().doc(id));
  const snaps = await firestore().getAll(...refs);
  const existing = snaps.filter((s) => s.exists);
  const writer = firestore().bulkWriter();
  for (const s of existing) void writer.delete(s.ref);
  await writer.close();
  return existing.length;
}

/* ----------------------------- Site config ----------------------------- */

const siteDoc = () => firestore().collection(COL.config).doc("site");

export async function readSiteConfig(): Promise<SiteConfig | null> {
  const snap = await siteDoc().get();
  if (!snap.exists) return null;
  return { ...SITE_CONFIG_DEFAULTS, ...toRow<SiteConfig>(snap), id: 1 };
}

export async function saveSiteConfig(patch: Partial<Omit<SiteConfig, "id" | "updatedAt">>): Promise<SiteConfig> {
  await siteDoc().set({ ...patch, updatedAt: new Date() }, { merge: true });
  return (await readSiteConfig())!;
}

/* ------------------------------- AI logs ------------------------------- */

const aiLogs = () => firestore().collection(COL.aiLogs);

export async function createAiLog(entry: Omit<AiLog, "id" | "createdAt">): Promise<void> {
  await aiLogs().doc(newId()).create({ ...entry, createdAt: new Date() });
}

export async function recentAiLogs(limit: number): Promise<AiLog[]> {
  const snap = await aiLogs().orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => toRow<AiLog>(d));
}

/** Success / failure counts since `since` (one range query, counted in memory). */
export async function aiLogCounts(since: Date): Promise<{ success: number; failure: number }> {
  const snap = await aiLogs().where("createdAt", ">=", since).select("success").get();
  let success = 0;
  for (const d of snap.docs) if (d.get("success") === true) success++;
  return { success, failure: snap.size - success };
}
