import Link from "next/link";
import { Github, Instagram, Linkedin, Mail } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { getSiteConfig } from "@/lib/projects";

export default async function Footer() {
  const config = await getSiteConfig();
  const year = new Date().getFullYear();

  const socials = [
    { href: config.email ? `mailto:${config.email}` : "", icon: Mail, label: "Email" },
    { href: config.githubUrl, icon: Github, label: "GitHub" },
    { href: config.linkedinUrl, icon: Linkedin, label: "LinkedIn" },
    { href: config.instagramUrl, icon: Instagram, label: "Instagram" },
  ].filter((item) => item.href.length > 0);

  return (
    <footer className="relative z-10 mt-24 border-t border-[var(--border)]">
      <div className="container-page flex flex-col items-center gap-6 py-10 md:flex-row md:justify-between">
        <Link href="/" className="flex items-center gap-2 font-display text-base font-semibold">
          <BrandMark size={28} className="h-7 w-7" />
          Arovyx <span className="text-accent-600 dark:text-accent-400">Studio</span>
        </Link>

        <nav className="flex items-center gap-5" aria-label="Social links">
          {socials.map(({ href, icon: Icon, label }) => (
            <a
              key={label}
              href={href}
              target={href.startsWith("mailto:") ? undefined : "_blank"}
              rel="noopener noreferrer"
              aria-label={label}
              className="text-[var(--muted)] transition-colors hover:text-accent-500"
            >
              <Icon className="h-5 w-5" aria-hidden />
            </a>
          ))}
        </nav>

        <div className="flex flex-col items-center gap-1 text-center text-xs text-[var(--muted)] md:items-end">
          <p>© {year} {config.siteName}. All rights reserved.</p>
          <p className="inline-flex items-center gap-1 opacity-70">
            Built with
            <span role="img" aria-label="love" className="text-red-500">
              ❤️
            </span>
            and caffeine
            <span role="img" aria-label="coffee">
              ☕
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
