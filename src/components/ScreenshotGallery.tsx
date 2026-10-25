"use client";

import { useState } from "react";

/**
 * Horizontal phone-screenshot gallery. Screenshots that fail to load are
 * dropped, and the whole section disappears if none are left.
 */
export default function ScreenshotGallery({
  title,
  screenshots,
}: {
  title: string;
  /** Display URLs (already passed through mediaSrc). */
  screenshots: string[];
}) {
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const visible = screenshots.filter((src) => !failed.has(src));
  if (visible.length === 0) return null;

  return (
    <section aria-labelledby="screenshots-heading" className="mt-12">
      <h2 id="screenshots-heading" className="micro-label">
        Screenshots
      </h2>
      <ul className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
        {visible.map((src, index) => (
          <li key={src} className="shrink-0 snap-start">
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] shadow-card transition-all hover:-translate-y-1 hover:border-accent-500/50 hover:shadow-glow"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`Screenshot ${index + 1} of ${title}`}
                loading="lazy"
                onError={() => setFailed((prev) => new Set(prev).add(src))}
                className="h-[22rem] w-auto max-w-none object-cover sm:h-[26rem]"
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
