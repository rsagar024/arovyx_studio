import Link from "next/link";
import { Github, Instagram, Linkedin, Mail } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import Parallax from "@/components/motion/Parallax";
import Wordmark from "@/components/motion/Wordmark";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
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
    <footer className="relative z-10 mt-24 overflow-hidden border-t border-[var(--border)]">
      <Stagger className="container-page flex flex-col items-center gap-6 py-10 md:flex-row md:justify-between">
        <StaggerItem>
          <Link href="/" className="group flex items-center gap-2 font-display text-base font-semibold">
            <BrandMark size={28} className="h-7 w-7 transition-transform duration-500 group-hover:rotate-[8deg]" />
            Arovyx <span className="text-accent-600 dark:text-accent-400">Studio</span>
          </Link>
        </StaggerItem>

        <StaggerItem>
          <nav className="flex items-center gap-3" aria-label="Social links">
            {socials.map(({ href, icon: Icon, label }) => (
              <a
                key={label}
                href={href}
                target={href.startsWith("mailto:") ? undefined : "_blank"}
                rel="noopener noreferrer"
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-[var(--muted)] transition-all duration-300 hover:-translate-y-1 hover:border-accent-500/40 hover:bg-accent-400/10 hover:text-accent-500"
              >
                <Icon className="h-5 w-5" aria-hidden />
              </a>
            ))}
          </nav>
        </StaggerItem>

        <StaggerItem className="flex flex-col items-center gap-1 text-center text-xs text-[var(--muted)] md:items-end">
          <p>© {year} {config.siteName}. All rights reserved.</p>
          <p className="inline-flex items-center gap-1 opacity-70">
            Built with
            <span role="img" aria-label="love" className="inline-block text-red-500 motion-safe:animate-pulse">
              ❤️
            </span>
            and caffeine
            <span role="img" aria-label="coffee">
              ☕
            </span>
          </p>
        </StaggerItem>
      </Stagger>

      {/* oversized wordmark peeking up from the bottom edge */}
      <Parallax offset={20} className="pointer-events-none select-none">
        <Wordmark
          text="AROVYX"
          // phones: breathing room below so the whole word sits clear of the screen edge
          className="mb-10 font-display sm:-mb-[0.08em] text-[clamp(4rem,19vw,16rem)] font-semibold leading-none tracking-tightest"
        />
      </Parallax>
    </footer>
  );
}
