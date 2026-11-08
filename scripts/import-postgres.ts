/**
 * Copies the site's data from the old Postgres (Neon) database into Firestore.
 *
 *   npx tsx scripts/import-postgres.ts --from "<postgres url>" [--dry-run] [--skip-settings] [--remove-samples]
 *
 * - Every row keeps its id, so the import is idempotent: run it again and it
 *   overwrites the same documents instead of duplicating them.
 * - --dry-run       reads and counts, writes nothing
 * - --skip-settings keeps the settings and schedules already in Firestore
 *                   (config/site, config/quizSchedule, config/colorTapSchedule)
 * - --remove-samples deletes the seed's sample projects (pulseboard,
 *                   nebula-drift, tinyfetch) unless the source has them under the same id
 *
 * A project whose slug is already used in Firestore by a different id is
 * skipped and reported, never duplicated.
 */
import pg from "pg";
import { scriptFirestore } from "./lib/firestore";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const fromIdx = args.indexOf("--from");
const from = fromIdx >= 0 ? args[fromIdx + 1] : undefined;
if (!from) {
  console.error('Usage: npx tsx scripts/import-postgres.ts --from "<postgres url>" [--dry-run] [--skip-settings] [--remove-samples]');
  process.exit(2);
}
const dryRun = flag("--dry-run");
const skipSettings = flag("--skip-settings");
const removeSamples = flag("--remove-samples");
const SAMPLE_SLUGS = ["pulseboard", "nebula-drift", "tinyfetch"];

// Prisma wrote UTC into `timestamp` (without time zone) columns. Read them as
// UTC, not as this machine's local time.
pg.types.setTypeParser(1114, (s: string) => new Date(s.replace(" ", "T") + "Z"));

type Row = Record<string, unknown>;

/** `${ms}-${id}`: log documents sort by time, then by their original id. */
const logDocId = (at: Date, id: string) => `${at.getTime().toString().padStart(13, "0")}-${id}`;

async function main() {
  const client = new pg.Client({ connectionString: from, connectionTimeoutMillis: 20_000 });
  await client.connect();
  const table = async (name: string): Promise<Row[]> => {
    try {
      return (await client.query(`SELECT * FROM "${name}"`)).rows as Row[];
    } catch (err) {
      if ((err as { code?: string }).code === "42P01") return []; // table doesn't exist
      throw err;
    }
  };

  const src = {
    projects: await table("Project"),
    messages: await table("ContactMessage"),
    site: await table("SiteConfig"),
    aiLogs: await table("AiLog"),
    quizSchedule: await table("QuizSchedule"),
    quizRuns: await table("QuizRun"),
    quizSteps: await table("QuizRunStep"),
    quizLogs: await table("QuizLog"),
    ctSchedule: await table("ColorTapSchedule"),
    ctRuns: await table("ColorTapRun"),
    ctLogs: await table("ColorTapLog"),
  };
  await client.end();

  console.log("Source (Postgres):");
  for (const [k, v] of Object.entries(src)) console.log(`  ${k.padEnd(13)} ${v.length}`);
  if (dryRun) {
    console.log("Dry run: nothing written.");
    return;
  }

  const db = scriptFirestore();
  const writer = db.bulkWriter();
  writer.onWriteError((err) => err.failedAttempts < 5);
  let writes = 0;
  const put = (path: string, data: Row) => {
    void writer.set(db.doc(path), data);
    writes++;
  };
  const strip = (row: Row, ...keys: string[]) => {
    const out = { ...row };
    for (const k of ["id", ...keys]) delete out[k];
    return out;
  };

  // Projects: skip any whose slug belongs to a different Firestore document.
  const sourceIds = new Set(src.projects.map((p) => String(p.id)));
  const existing = await db.collection("projects").get();
  const slugOwner = new Map(existing.docs.map((d) => [String(d.get("slug")), d.id]));
  if (removeSamples) {
    for (const d of existing.docs) {
      if (SAMPLE_SLUGS.includes(String(d.get("slug"))) && !sourceIds.has(d.id)) {
        void writer.delete(d.ref);
        slugOwner.delete(String(d.get("slug")));
        console.log(`  - removed sample project ${d.get("slug")}`);
      }
    }
  }
  const skipped: string[] = [];
  for (const p of src.projects) {
    const owner = slugOwner.get(String(p.slug));
    if (owner && owner !== p.id) {
      skipped.push(`${p.slug} (Firestore has it as ${owner})`);
      continue;
    }
    put(`projects/${p.id}`, strip(p));
  }

  for (const m of src.messages) put(`contactMessages/${m.id}`, strip(m));
  for (const l of src.aiLogs) put(`aiLogs/${l.id}`, strip(l));

  if (!skipSettings) {
    if (src.site[0]) put("config/site", strip(src.site[0]));
    if (src.quizSchedule[0]) put("config/quizSchedule", strip(src.quizSchedule[0]));
    if (src.ctSchedule[0]) put("config/colorTapSchedule", strip(src.ctSchedule[0]));
  }

  for (const r of src.quizRuns) put(`quizRuns/${r.id}`, strip(r));
  for (const s of src.quizSteps) {
    put(`quizRuns/${s.runId}/steps/${encodeURIComponent(String(s.key))}`, strip(s, "runId"));
  }
  for (const l of src.quizLogs) put(`quizRuns/${l.runId}/logs/${logDocId(l.at as Date, String(l.id))}`, strip(l, "runId"));

  for (const r of src.ctRuns) put(`colorTapRuns/${r.id}`, strip(r));
  for (const l of src.ctLogs) put(`colorTapRuns/${l.runId}/logs/${logDocId(l.at as Date, String(l.id))}`, strip(l, "runId"));

  await writer.close();
  console.log(`\nWrote ${writes} documents.`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} project(s) whose slug is taken:`);
    for (const s of skipped) console.log(`  ! ${s}`);
  }

  const count = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count;
  console.log("\nFirestore now:");
  console.log(`  projects      ${await count(db.collection("projects"))}`);
  console.log(`  messages      ${await count(db.collection("contactMessages"))}`);
  console.log(`  aiLogs        ${await count(db.collection("aiLogs"))}`);
  console.log(`  quizRuns      ${await count(db.collection("quizRuns"))}`);
  console.log(`  colorTapRuns  ${await count(db.collection("colorTapRuns"))}`);
  console.log(`  steps (all)   ${await count(db.collectionGroup("steps"))}`);
  console.log(`  logs (all)    ${await count(db.collectionGroup("logs"))}`);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
