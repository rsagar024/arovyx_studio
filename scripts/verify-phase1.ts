import { db } from "../src/lib/db";
import { toProjectDTO } from "../src/lib/validators";
import { uniqueSlug, slugify } from "../src/lib/slug";

async function main() {
  const rows = await db.project.findMany({ orderBy: { createdAt: "asc" } });
  const dtos = rows.map(toProjectDTO);

  console.log("projects:", dtos.length);
  for (const p of dtos) {
    console.log(
      ` - ${p.slug} [${p.category}/${p.status}] tags=${p.tags.length} tech=${p.techStack.length} features=${p.features.length} published=${p.isPublished}`
    );
  }

  const config = await db.siteConfig.findFirst();
  console.log("siteConfig:", config?.siteName, "| owner:", config?.ownerName);

  // slug helpers
  console.log("slugify:", slugify("Nebula Drift — v2!"));
  console.log("uniqueSlug(existing title):", await uniqueSlug("PulseBoard")); // must get a -2 suffix
  console.log("uniqueSlug(excluded self):", await uniqueSlug("PulseBoard", rows[0]?.id));

  // enum-guard mapper: a bad DB value falls back instead of throwing
  const bad = { ...rows[0]!, category: "NOPE", status: "WHATEVER" };
  console.log("mapper fallback:", toProjectDTO(bad).category, toProjectDTO(bad).status);

  const messages = await db.contactMessage.count();
  const aiLogs = await db.aiLog.count();
  console.log(`counts: projects=${dtos.length} messages=${messages} aiLogs=${aiLogs}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
