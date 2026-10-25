import type { Metadata } from "next";
import SettingsForm from "@/components/studio/SettingsForm";
import { getPublishedProjects, getSiteConfig } from "@/lib/projects";
import { parseJsonStringArray } from "@/lib/validators";

export const metadata: Metadata = { title: "Site Settings" };

/** Studio → Settings: site identity, socials and media (Phase 6D). */
export default async function StudioSettingsPage() {
  const [config, published] = await Promise.all([getSiteConfig(), getPublishedProjects()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Site settings</h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          Owner profile, social links and site identity — changes go live on the public site
          as soon as you save.
        </p>
      </div>

      <SettingsForm
        initial={{
          siteName: config.siteName,
          ownerName: config.ownerName,
          tagline: config.tagline,
          bio: config.bio,
          email: config.email,
          githubUrl: config.githubUrl,
          linkedinUrl: config.linkedinUrl,
          instagramUrl: config.instagramUrl,
          avatarUrl: config.avatarUrl,
          resumeUrl: config.resumeUrl,
        }}
        initialHeroIds={parseJsonStringArray(config.heroProjectIds)}
        heroOptions={published.map((p) => ({ id: p.id, title: p.title, category: p.category }))}
      />
    </div>
  );
}
