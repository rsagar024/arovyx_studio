"use client";

import { m, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { Hammer, Lightbulb, RefreshCw, Rocket } from "lucide-react";
import SplitText from "@/components/motion/SplitText";
import Reveal from "@/components/Reveal";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    icon: Lightbulb,
    title: "Spot the itch",
    body: "Every project starts with a real annoyance — mine or someone else's — and a quick prototype to see if it's worth scratching.",
  },
  {
    icon: Hammer,
    title: "Build it properly",
    body: "Typed, tested and tidy. Small surface area, sensible defaults, and docs written while the details are still fresh.",
  },
  {
    icon: Rocket,
    title: "Ship it",
    body: "Published where people already look — the Play Store, npm, PyPI, itch.io or the web — with a changelog from day one.",
  },
  {
    icon: RefreshCw,
    title: "Keep it alive",
    body: "Issues answered, dependencies bumped, features added when users ask. Shipping is the start, not the finish.",
  },
];

/**
 * "How I ship" — sticky heading on the left; on the right a rail fills as
 * you scroll and each step lights up when the fill reaches it.
 */
export default function ProcessSection() {
  const list = useRef<HTMLOListElement | null>(null);
  const { scrollYProgress } = useScroll({ target: list, offset: ["start 70%", "end 55%"] });
  const fill = useSpring(scrollYProgress, { stiffness: 120, damping: 24, restDelta: 0.001 });

  return (
    <section aria-labelledby="process-heading" className="container-page pt-28">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Reveal>
            <p className="micro-label">The process</p>
          </Reveal>
          <SplitText
            id="process-heading"
            text={["From idea", { text: "to shipped.", className: "gradient-text" }]}
            className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl"
          />
          <Reveal delay={200}>
            <p className="mt-5 max-w-sm leading-relaxed text-[var(--muted)]">
              Same loop for an app, a game or a tiny package — scroll to follow it.
            </p>
          </Reveal>
        </div>

        <ol ref={list} className="relative space-y-6 pl-14">
          {/* rail + fill */}
          <span aria-hidden className="absolute bottom-6 left-5 top-6 w-px bg-[var(--border)]" />
          <m.span
            aria-hidden
            className="absolute bottom-6 left-5 top-6 w-px origin-top bg-gradient-to-b from-accent-300 to-accent-600"
            style={{ scaleY: fill }}
          />
          {STEPS.map((step, index) => (
            <Step key={step.title} step={step} index={index} total={STEPS.length} progress={fill} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function Step({
  step,
  index,
  total,
  progress,
}: {
  step: (typeof STEPS)[number];
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const Icon = step.icon;
  // the step "activates" as the fill passes its dot
  const at = index / (total - 1 || 1);
  const lit = useTransform(progress, [at - 0.12, at], [0, 1]);
  const scale = useTransform(lit, [0, 1], [0.85, 1]);
  const cardOpacity = useTransform(lit, [0, 1], [0.45, 1]);

  return (
    <li className="relative">
      <m.span
        aria-hidden
        style={{ scale }}
        className="absolute -left-14 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg)]"
      >
        <m.span
          className="absolute inset-0 rounded-full bg-accent-400 shadow-glow"
          style={{ opacity: lit }}
        />
        <Icon className={cn("relative h-4 w-4 text-[var(--muted)]")} />
      </m.span>
      <m.div
        style={{ opacity: cardOpacity }}
        className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6 transition-colors hover:border-accent-500/40"
      >
        <p className="font-mono text-xs text-accent-600 dark:text-accent-400">Step {String(index + 1).padStart(2, "0")}</p>
        <h3 className="mt-2 font-display text-xl font-semibold">{step.title}</h3>
        <p className="mt-2 leading-relaxed text-[var(--muted)]">{step.body}</p>
      </m.div>
    </li>
  );
}
