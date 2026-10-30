import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Magnetic from "@/components/motion/Magnetic";
import SplitText from "@/components/motion/SplitText";
import Reveal from "@/components/Reveal";
import SectionLink from "@/components/SectionLink";

/** Closing call-to-action: full-width animated gradient panel. */
export default function CtaBand() {
  return (
    <section aria-labelledby="cta-heading" className="container-page pt-28">
      <Reveal variant="scale">
        <div className="relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-12 sm:py-20">
          {/* moving gradient + drifting blobs */}
          <div aria-hidden className="animated-gradient absolute inset-0 bg-gradient-to-br from-accent-700 via-accent-500 to-accent-300 bg-[length:200%_200%]" />
          <div aria-hidden className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/20 blur-3xl motion-safe:animate-float" />
          <div
            aria-hidden
            className="absolute -bottom-24 -right-10 h-80 w-80 rounded-full bg-ink-950/30 blur-3xl motion-safe:animate-float"
            style={{ animationDelay: "2s" }}
          />

          <div className="relative">
            <SplitText
              id="cta-heading"
              text={["Got an idea worth shipping?", "Let's build it."]}
              className="font-display text-[clamp(2rem,5vw,3.75rem)] font-semibold leading-[1.05] tracking-tight text-ink-950"
            />
            <Reveal delay={300}>
              <p className="mx-auto mt-5 max-w-lg text-ink-900/80">
                Apps, games, packages or plugins — tell me what you have in mind and I&apos;ll get back to you.
              </p>
            </Reveal>
            <Reveal delay={450}>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Magnetic>
                  <SectionLink
                    href="/#contact"
                    className="group inline-flex items-center gap-2 rounded-full bg-ink-950 px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
                  >
                    Start a conversation
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </SectionLink>
                </Magnetic>
                <Magnetic>
                  <Link
                    href="/projects"
                    className="inline-flex items-center gap-2 rounded-full border border-ink-950/30 px-6 py-3.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-ink-950/10"
                  >
                    See all work
                  </Link>
                </Magnetic>
              </div>
            </Reveal>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
