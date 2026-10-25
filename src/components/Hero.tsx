"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Zap } from "lucide-react";
import { CATEGORY_META, cn, mediaSrc } from "@/lib/utils";
import SafeImg from "@/components/SafeImg";
import SectionLink from "@/components/SectionLink";
import type { Category } from "@/lib/validators";

const PHRASES = [
  "apps that ship.",
  "games that flow.",
  "packages devs reuse.",
  "plugins that extend.",
];

/** One floating showcase card — chosen in Studio → Settings → Hero showcase. */
export interface HeroCard {
  slug: string;
  title: string;
  category: Category;
  /** Short subtitle (tech stack or description). */
  meta: string;
  iconUrl: string | null;
}

/** Layout + float phase per card position (up to 3). */
const CARD_SLOTS = [
  { delay: 0, className: "w-[85%]" },
  { delay: 1200, className: "ml-auto w-[85%]" },
  { delay: 2400, className: "w-[85%] sm:ml-8" },
];

/**
 * Asymmetric hero (spec §9): big display type left, gradient orb +
 * floating project cards right. Fluid via clamp() so it scales smoothly
 * from 360px phones through tablets to laptop/desktop.
 */
export default function Hero({
  ownerName,
  tagline,
  bio,
  cards,
}: {
  ownerName: string;
  tagline: string;
  bio: string;
  /** Real projects for the floating cards; empty = orb only. */
  cards: HeroCard[];
}) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setTyped(PHRASES[0]!);
      return;
    }

    const full = PHRASES[phraseIndex]!;
    let timeout: ReturnType<typeof setTimeout>;

    if (!deleting && typed === full) {
      timeout = setTimeout(() => setDeleting(true), 1600);
    } else if (deleting && typed === "") {
      setDeleting(false);
      setPhraseIndex((i) => (i + 1) % PHRASES.length);
      return;
    } else {
      const nextLength = deleting ? typed.length - 1 : typed.length + 1;
      timeout = setTimeout(() => setTyped(full.slice(0, nextLength)), deleting ? 35 : 75);
    }

    return () => clearTimeout(timeout);
  }, [typed, deleting, phraseIndex]);

  return (
    <section className="relative overflow-hidden pb-14 pt-12 sm:pb-16 sm:pt-14 md:pb-24 md:pt-20 lg:pt-24">
      {/* diagonal accent line — hidden on small screens to avoid crowding */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-0 hidden h-[420px] w-px rotate-[24deg] bg-gradient-to-b from-transparent via-accent-500/50 to-transparent sm:block"
      />

      <div className="container-page grid items-center gap-10 md:gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        {/* ---------- left: display type ---------- */}
        <div className="animate-fade-up">
          <p className="micro-label flex items-center gap-2">
            <span className="inline-block h-px w-8 bg-accent-500/60" aria-hidden />
            <span className="truncate">{ownerName}</span>
          </p>

          <h1 className="mt-5 font-display text-[clamp(2.75rem,8.5vw,6.5rem)] font-semibold leading-[0.95] tracking-tightest">
            Arovyx
            <br />
            <span className="gradient-text">Studio</span>
          </h1>

          <p className="mt-5 min-h-[1.5em] font-mono text-[clamp(1.05rem,2.4vw,1.5rem)] leading-snug">
            <span className="sr-only">We build apps, games, packages &amp; plugins.</span>
            <span aria-hidden>
              We build <span className="text-accent-600 dark:text-accent-400">{typed}</span>
              <span className="animate-caret-blink text-accent-500">▍</span>
            </span>
          </p>

          <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">
            {bio || tagline}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3 sm:mt-9">
            <Link
              href="/projects"
              className="group inline-flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-3 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow"
            >
              Explore projects
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <SectionLink
              href="/#contact"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-5 py-3 text-sm font-medium text-[var(--fg)] transition-colors hover:border-accent-500/50"
            >
              Get in touch
            </SectionLink>
          </div>
        </div>

        {/* ---------- right: orb + floating cards (tablet & up) ---------- */}
        <div className="relative mx-auto hidden w-full max-w-[22rem] justify-self-center md:flex lg:max-w-md">
          <div aria-hidden className="absolute -inset-6 animate-pulse-glow rounded-full bg-gradient-to-tr from-accent-500/30 via-accent-400/10 to-transparent blur-3xl" />
          <div aria-hidden className="absolute right-4 top-0 h-36 w-36 animate-gradient-x rounded-full bg-gradient-to-br bg-[length:200%_200%] from-accent-400 via-accent-600 to-accent-300 opacity-80 sm:h-44 sm:w-44 lg:right-6 lg:top-4 lg:h-52 lg:w-52" />

          {cards.length > 0 && (
            <ul aria-label="Featured work" className="relative w-full space-y-3 pt-14 sm:space-y-4 sm:pt-16 lg:pt-20">
              {cards.slice(0, CARD_SLOTS.length).map((card, index) => (
                <FloatingCard key={card.slug} card={card} {...CARD_SLOTS[index]!} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function FloatingCard({
  card,
  delay,
  className,
}: {
  card: HeroCard;
  /** Float-animation offset in ms so the cards drift out of phase. */
  delay: number;
  className?: string;
}) {
  const meta = CATEGORY_META[card.category];
  return (
    // outer wrapper floats; inner card keeps its own hover lift
    <li className={cn("motion-safe:animate-float", className)} style={{ animationDelay: `${delay}ms` }}>
      <Link
        href={`/projects/${card.slug}`}
        className={cn(
          "glass block rounded-xl p-4 shadow-card transition-all duration-300 hover:-translate-y-1 focus-visible:-translate-y-1",
          meta.hoverBorder
        )}
      >
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-semibold uppercase tracking-micro ${meta.accentText}`}>
            {meta.label}
          </span>
          <Zap className="h-3.5 w-3.5 text-accent-400/70" aria-hidden />
        </div>
        <div className="mt-2 flex items-center gap-2.5">
          {card.iconUrl && (
            <SafeImg
              src={mediaSrc(card.iconUrl)}
              alt=""
              aria-hidden
              className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border)] object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold">{card.title}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--muted)]">{card.meta}</p>
          </div>
        </div>
      </Link>
    </li>
  );
}
