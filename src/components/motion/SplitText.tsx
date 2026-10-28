"use client";

import { m } from "motion/react";
import { Fragment } from "react";
import { EASE_OUT, VIEWPORT } from "@/lib/motion";

type Line = string | { text: string; className?: string };

const WORD_VARIANTS = (delay: number) => ({
  hidden: { y: "110%", opacity: 0 },
  show: { y: "0%", opacity: 1, transition: { duration: 0.8, ease: EASE_OUT, delay } },
});

/**
 * Heading whose words slide up out of a mask, one after another.
 * The full text is the element's accessible name; the animated words are
 * hidden from assistive tech. Pass an array for explicit line breaks.
 *
 * `onMount` (above the fold) uses a CSS animation so the heading paints
 * before hydration; otherwise Motion plays it when scrolled into view.
 */
export default function SplitText({
  text,
  as = "h2",
  className,
  delay = 0,
  step = 0.06,
  onMount = false,
  id,
}: {
  text: Line | Line[];
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  /** Seconds before the first word. */
  delay?: number;
  /** Seconds between words. */
  step?: number;
  /** Animate immediately instead of when scrolled into view (above the fold). */
  onMount?: boolean;
  id?: string;
}) {
  const lines = (Array.isArray(text) ? text : [text]).map((line) =>
    typeof line === "string" ? { text: line } : line
  );
  const label = lines.map((line) => line.text).join(" ");
  let index = 0;

  const words = lines.map((line, lineIndex) => (
    <Fragment key={lineIndex}>
      {lineIndex > 0 && <br />}
      {line.text.split(/\s+/).filter(Boolean).map((word, wordIndex) => {
        const wordDelay = delay + index++ * step;
        return (
          <Fragment key={wordIndex}>
            {wordIndex > 0 && " "}
            {/* mask: padding keeps descenders from being clipped */}
            <span aria-hidden className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-bottom">
              {onMount ? (
                <span className="inline-block motion-safe:animate-word-up" style={{ animationDelay: `${wordDelay}s` }}>
                  <Word text={word} className={line.className} />
                </span>
              ) : (
                <m.span data-reveal="" className="inline-block" variants={WORD_VARIANTS(wordDelay)}>
                  <Word text={word} className={line.className} />
                </m.span>
              )}
            </span>
          </Fragment>
        );
      })}
    </Fragment>
  ));

  if (onMount) {
    const Tag = as;
    return (
      <Tag id={id} aria-label={label} className={className}>
        {words}
      </Tag>
    );
  }

  const MotionTag = m[as];
  return (
    <MotionTag id={id} aria-label={label} className={className} initial="hidden" whileInView="show" viewport={VIEWPORT}>
      {words}
    </MotionTag>
  );
}

/**
 * The line's own styling sits on an inner span: classes like `.gradient-text`
 * carry their own `animation`, which would cancel the entrance on the same element.
 */
function Word({ text, className }: { text: string; className?: string }) {
  return className ? <span className={className}>{text}</span> : <>{text}</>;
}
