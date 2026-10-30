"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  m,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { ArrowRight, Check, Zap } from "lucide-react";
import { CATEGORY_META, cn, mediaSrc } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";
import SafeImg from "@/components/SafeImg";
import SectionLink from "@/components/SectionLink";
import Magnetic from "@/components/motion/Magnetic";
import SplitText from "@/components/motion/SplitText";
import TiltCard from "@/components/motion/TiltCard";
import type { Category } from "@/lib/validators";

const PHRASES = [
  "apps that ship.",
  "games that flow.",
  "packages devs reuse.",
  "plugins that extend.",
];

const CHIP_ORDER: Category[] = ["APP", "GAME", "PACKAGE", "PLUGIN"];

/** One floating showcase card — chosen in Studio → Settings → Hero showcase. */
export interface HeroCard {
  slug: string;
  title: string;
  category: Category;
  /** Short subtitle (tech stack or description). */
  meta: string;
  iconUrl: string | null;
}

/** Layout, float phase and mouse-parallax depth per card position (up to 3). */
const CARD_SLOTS = [
  { delay: 0, depth: 18, className: "w-[85%]" },
  { delay: 1200, depth: 34, className: "ml-auto w-[85%]" },
  { delay: 2400, depth: 24, className: "w-[85%] sm:ml-8" },
];

const SPRING = { stiffness: 120, damping: 20, mass: 0.6 };

/**
 * Delay for the left column's CSS entrances (`animate-fade-up`), in sequence
 * after the headline. CSS, not JS, so the above-the-fold copy paints before
 * hydration.
 */
const rise = (delay: number) => ({ animationDelay: `${delay}s` });

/**
 * Asymmetric hero (spec §9): big display type left, gradient orb +
 * floating project cards right. Fluid via clamp() so it scales smoothly
 * from 360px phones through tablets to laptop/desktop. The right side
 * shifts in layers with the mouse; the whole hero drifts as you scroll away.
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
  const reduceMotion = useReducedMotion();
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  const section = useRef<HTMLElement | null>(null);
  // pointer position within the hero, -0.5…0.5 on each axis
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, SPRING);
  const sy = useSpring(my, SPRING);
  // cursor spotlight (px within the section)
  const gx = useMotionValue(-999);
  const gy = useMotionValue(-999);
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${gx}px ${gy}px, rgba(34,211,238,0.10), transparent 60%)`;

  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end start"] });
  const leftY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const rightY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  useEffect(() => {
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
  }, [typed, deleting, phraseIndex, reduceMotion]);

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || reduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    mx.set((event.clientX - rect.left) / rect.width - 0.5);
    my.set((event.clientY - rect.top) / rect.height - 0.5);
    gx.set(event.clientX - rect.left);
    gy.set(event.clientY - rect.top);
  }

  function onPointerLeave() {
    mx.set(0);
    my.set(0);
    gx.set(-999);
    gy.set(-999);
  }

  return (
    <section
      ref={section}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="relative overflow-hidden pb-14 pt-12 sm:pb-16 sm:pt-14 md:pb-24 md:pt-20 lg:pt-24"
    >
      {/* cursor spotlight */}
      <m.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: spotlight }} />

      {/* diagonal accent line — hidden on small screens to avoid crowding */}
      <m.div
        data-reveal=""
        aria-hidden
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 1.4, ease: EASE_OUT, delay: 0.3 }}
        className="pointer-events-none absolute -right-24 top-0 hidden h-[420px] w-px origin-top rotate-[24deg] bg-gradient-to-b from-transparent via-accent-500/50 to-transparent sm:block"
      />

      <div className="container-page grid items-center gap-10 md:gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        {/* ---------- left: display type ---------- */}
        <m.div style={{ y: leftY, opacity: fade }}>
          <p style={rise(0)} className="motion-safe:animate-fade-up micro-label flex items-center gap-2">
            <m.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, ease: EASE_OUT }}
              className="inline-block h-px w-8 origin-left bg-accent-500/60"
              aria-hidden
            />
            <span className="truncate">{ownerName}</span>
          </p>

          <SplitText
            as="h1"
            onMount
            delay={0.1}
            step={0.12}
            text={["Arovyx", { text: "Studio", className: "gradient-text" }]}
            className="mt-5 font-display text-[clamp(2.75rem,8.5vw,6.5rem)] font-semibold leading-[0.95] tracking-tightest"
          />

          <p style={rise(0.45)} className="motion-safe:animate-fade-up mt-5 min-h-[1.5em] font-mono text-[clamp(1.05rem,2.4vw,1.5rem)] leading-snug">
            <span className="sr-only">We build apps, games, packages &amp; plugins.</span>
            <span aria-hidden>
              We build <span className="text-accent-600 dark:text-accent-400">{typed}</span>
              <span className="animate-caret-blink text-accent-500">▍</span>
            </span>
          </p>

          <p style={rise(0.55)} className="motion-safe:animate-fade-up mt-4 max-w-xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">
            {bio || tagline}
          </p>

          {/* category chips (monday-style role chips) */}
          <ul aria-label="What I build" className="mt-6 flex flex-wrap gap-2">
            {CHIP_ORDER.map((category, index) => (
              <li key={category} style={rise(0.65 + index * 0.07)} className="motion-safe:animate-fade-up">
                <Link
                  href={`/projects?category=${category}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-transform duration-300 hover:-translate-y-0.5 hover:scale-105",
                    CATEGORY_META[category].chip
                  )}
                >
                  <Check className="h-3 w-3" aria-hidden />
                  {CATEGORY_META[category].plural}
                </Link>
              </li>
            ))}
          </ul>

          <div style={rise(0.9)} className="motion-safe:animate-fade-up mt-7 flex flex-wrap items-center gap-3 sm:mt-9">
            <Magnetic>
              <Link
                href="/projects"
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-accent-500 px-5 py-3 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow"
              >
                {/* sheen sweeping across on hover */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/40 opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100"
                />
                Explore projects
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </Magnetic>
            <Magnetic>
              <SectionLink
                href="/#contact"
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-5 py-3 text-sm font-medium text-[var(--fg)] transition-colors hover:border-accent-500/50"
              >
                Get in touch
              </SectionLink>
            </Magnetic>
          </div>
        </m.div>

        {/* ---------- right: orb + floating cards (below the copy on phones) ---------- */}
        <m.div
          style={{ y: rightY }}
          className="relative mx-auto flex w-full max-w-[20rem] justify-self-center sm:max-w-[22rem] lg:max-w-md"
        >
          <Layer x={sx} y={sy} depth={-14} className="absolute -inset-6">
            <div aria-hidden className="h-full w-full animate-pulse-glow rounded-full bg-gradient-to-tr from-accent-500/30 via-accent-400/10 to-transparent blur-3xl" />
          </Layer>
          <Layer x={sx} y={sy} depth={-28} className="absolute right-4 top-0 lg:right-6 lg:top-4">
            <m.div
              data-reveal=""
              aria-hidden
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.8 }}
              transition={{ duration: 1.2, ease: EASE_OUT, delay: 0.2 }}
              className="h-36 w-36 animate-gradient-x rounded-full bg-gradient-to-br bg-[length:200%_200%] from-accent-400 via-accent-600 to-accent-300 sm:h-44 sm:w-44 lg:h-52 lg:w-52"
            />
          </Layer>

          {cards.length > 0 && (
            <ul aria-label="Featured work" className="relative w-full space-y-3 pt-14 sm:space-y-4 sm:pt-16 lg:pt-20">
              {cards.slice(0, CARD_SLOTS.length).map((card, index) => (
                <FloatingCard key={card.slug} card={card} index={index} x={sx} y={sy} {...CARD_SLOTS[index]!} />
              ))}
            </ul>
          )}
        </m.div>
      </div>

      {/* scroll cue */}
      <m.div
        data-reveal=""
        aria-hidden
        style={{ opacity: fade }}
        className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 md:block"
      >
        <span className="flex h-9 w-5 justify-center rounded-full border border-[var(--border)] pt-1.5">
          <span className="h-2 w-1 rounded-full bg-accent-400 motion-safe:animate-bounce-y" />
        </span>
      </m.div>
    </section>
  );
}

/** Wrapper that shifts with the mouse; larger |depth| = closer to the viewer. */
function Layer({
  x,
  y,
  depth,
  className,
  children,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  depth: number;
  className?: string;
  children: React.ReactNode;
}) {
  const tx = useTransform(x, (v) => v * depth);
  const ty = useTransform(y, (v) => v * depth);
  return (
    <m.div className={className} style={{ x: tx, y: ty }}>
      {children}
    </m.div>
  );
}

function FloatingCard({
  card,
  index,
  delay,
  depth,
  x,
  y,
  className,
}: {
  card: HeroCard;
  index: number;
  /** Float-animation offset in ms so the cards drift out of phase. */
  delay: number;
  depth: number;
  x: MotionValue<number>;
  y: MotionValue<number>;
  className?: string;
}) {
  const meta = CATEGORY_META[card.category];
  const tx = useTransform(x, (v) => v * depth);
  const ty = useTransform(y, (v) => v * depth);
  return (
    // mouse-parallax wrapper → spring entrance → CSS float → tilt card
    <m.li className={className} style={{ x: tx, y: ty }}>
      <m.div
        data-reveal=""
        initial={{ opacity: 0, x: 60, rotate: 6 }}
        animate={{ opacity: 1, x: 0, rotate: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.5 + index * 0.15 }}
      >
        <div className="motion-safe:animate-float" style={{ animationDelay: `${delay}ms` }}>
          <TiltCard max={10} className="rounded-xl">
            <Link
              href={`/projects/${card.slug}`}
              className={cn(
                "glass block rounded-xl p-4 shadow-card transition-colors duration-300 dark:bg-[rgb(var(--bg-rgb)/0.55)]",
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
          </TiltCard>
        </div>
      </m.div>
    </m.li>
  );
}
