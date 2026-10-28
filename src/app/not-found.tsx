import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SkipLink from "@/components/SkipLink";
import MotionProvider from "@/components/motion/MotionProvider";
import Magnetic from "@/components/motion/Magnetic";
import LostCompass from "@/components/motion/LostCompass";
import SplitText from "@/components/motion/SplitText";
import Reveal from "@/components/Reveal";

// Rendered in the root layout (outside the (public) group), so it brings its own chrome.
export default function NotFound() {
  return (
    <MotionProvider>
      <div className="relative flex min-h-screen flex-col">
        <SkipLink />
        <Navbar />
        <main
          id="main"
          tabIndex={-1}
          className="container-page relative z-10 flex flex-1 flex-col items-center justify-center py-24 text-center"
        >
          <LostCompass />

          <Reveal delay={150}>
            <p className="micro-label mt-6">Error 404</p>
          </Reveal>
          <SplitText
            as="h1"
            text="Off the map"
            onMount
            delay={0.2}
            className="mt-3 font-display text-5xl font-semibold tracking-tight sm:text-6xl"
          />
          <Reveal delay={450}>
            <p className="mt-4 max-w-md text-[var(--muted)]">
              This page doesn&apos;t exist — it may have been moved, renamed, or never shipped.
            </p>
          </Reveal>

          <Reveal delay={600}>
            <Magnetic className="mt-8 inline-block">
              <Link
                href="/"
                className="group inline-flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-3 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow"
              >
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" aria-hidden />
                Back to studio
              </Link>
            </Magnetic>
          </Reveal>
        </main>
        <Footer />
      </div>
    </MotionProvider>
  );
}
