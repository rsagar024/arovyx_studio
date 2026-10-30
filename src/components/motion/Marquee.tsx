import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Endless horizontal ticker. The items render twice and the track slides by
 * exactly one copy, so the loop is seamless; the copy is hidden from
 * assistive tech. Pauses on hover; edges fade out. CSS-only (server-safe).
 */
export default function Marquee({
  children,
  reverse = false,
  seconds = 40,
  className,
  label,
}: {
  children: ReactNode;
  reverse?: boolean;
  /** Time for one full loop. */
  seconds?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      aria-label={label}
      className={cn(
        "group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]",
        className
      )}
    >
      {[0, 1].map((copy) => (
        <div
          key={copy}
          aria-hidden={copy === 1 || undefined}
          className={cn(
            "flex min-w-full shrink-0 items-center justify-around gap-4 pr-4 motion-safe:animate-marquee group-hover:[animation-play-state:paused]",
            reverse && "[animation-direction:reverse]"
          )}
          style={{ animationDuration: `${seconds}s` }}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
