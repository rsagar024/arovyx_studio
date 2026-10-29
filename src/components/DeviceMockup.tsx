"use client";

import { useState } from "react";
import SafeImg from "@/components/SafeImg";
import { cn, mediaSrc } from "@/lib/utils";

/** Fan position per phone: centre phone in front, the others tucked behind. */
const FAN = [
  "z-20 translate-x-0 rotate-0 group-hover:-translate-y-2 group-active-touch:-translate-y-2",
  "z-10 -translate-x-[62%] -rotate-[8deg] scale-90 group-hover:-translate-x-[78%] group-hover:-rotate-[12deg] group-active-touch:-translate-x-[78%] group-active-touch:-rotate-[12deg]",
  "z-10 translate-x-[62%] rotate-[8deg] scale-90 group-hover:translate-x-[78%] group-hover:rotate-[12deg] group-active-touch:translate-x-[78%] group-active-touch:rotate-[12deg]",
];

/**
 * Shows a project's media in a frame that fits it, so nothing is cropped
 * into a meaningless slice:
 * - portrait screenshots → a fan of phone mockups (whole screen visible)
 * - a landscape first screenshot or a store banner → a browser window
 * - only an icon/logo → a large app-icon tile
 * Hover effects key off a `group` class on an ancestor; on touch screens the
 * same effects play when that ancestor sets data-active="true".
 */
export default function DeviceMockup({
  title,
  screenshots,
  bannerUrl,
  iconUrl,
  size = "lg",
  className,
}: {
  title: string;
  screenshots: string[];
  bannerUrl?: string | null;
  iconUrl?: string | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  // screenshots that failed to load are dropped
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  // orientation of the first screenshot, measured once it loads
  const [landscape, setLandscape] = useState<boolean | null>(null);
  const shots = screenshots.filter((src) => !failed.has(src)).slice(0, 3);
  const drop = (src: string) => setFailed((prev) => new Set(prev).add(src));
  const measure = (img: HTMLImageElement) => setLandscape(img.naturalWidth > img.naturalHeight * 1.1);

  if (shots.length > 0 && landscape !== true) {
    // phones until the first image turns out to be landscape
    const phone = size === "lg" ? "h-[19rem]" : "h-48";
    return (
      <div className={cn("relative flex items-center justify-center", className)}>
        {shots.map((src, index) => (
          <div
            key={src}
            className={cn(
              "absolute aspect-[9/19.5] overflow-hidden rounded-[1.4rem] border-[5px] border-ink-950 bg-ink-950 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
              phone,
              shots.length === 1 ? "rotate-[4deg] group-hover:rotate-0 group-active-touch:rotate-0" : FAN[index]
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaSrc(src)}
              alt={index === 0 ? `${title} screenshot` : ""}
              loading="lazy"
              onError={() => drop(src)}
              // ref catches images already loaded (cache) before hydration
              ref={
                index === 0
                  ? (img) => {
                      if (img?.complete && img.naturalWidth > 0) measure(img);
                    }
                  : undefined
              }
              onLoad={index === 0 ? (event) => measure(event.currentTarget) : undefined}
              className="h-full w-full object-cover object-top"
            />
          </div>
        ))}
      </div>
    );
  }

  const wide = landscape === true ? shots[0] : bannerUrl;
  if (wide) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <div className="w-[88%] overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-2 group-hover:scale-[1.02] group-active-touch:-translate-y-2 group-active-touch:scale-[1.02]">
          <div className="flex gap-1.5 border-b border-white/10 px-3 py-2" aria-hidden>
            <span className="h-2 w-2 rounded-full bg-red-400/70" />
            <span className="h-2 w-2 rounded-full bg-amber-400/70" />
            <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
          </div>
          <SafeImg src={mediaSrc(wide)} alt={`${title} preview`} className="block aspect-[1024/500] w-full object-cover" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className="relative flex items-center justify-center">
        {/* soft rings behind the icon */}
        <span aria-hidden className="absolute h-56 w-56 rounded-full border border-white/5" />
        <span aria-hidden className="absolute h-40 w-40 rounded-full border border-white/10 motion-safe:animate-pulse-glow" />
        <div
          className={cn(
            "relative flex items-center justify-center overflow-hidden rounded-[1.75rem] bg-white p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-2 group-hover:rotate-[-4deg] group-active-touch:-translate-y-2 group-active-touch:rotate-[-4deg]",
            size === "lg" ? "h-32 w-32" : "h-24 w-24"
          )}
        >
          {iconUrl ? (
            <SafeImg
              src={mediaSrc(iconUrl)}
              alt={`${title} icon`}
              className="max-h-full max-w-full object-contain"
              fallback={<Initial title={title} />}
            />
          ) : (
            <Initial title={title} />
          )}
        </div>
      </div>
    </div>
  );
}

function Initial({ title }: { title: string }) {
  return <span className="font-display text-5xl font-semibold text-ink-950">{title.charAt(0).toUpperCase()}</span>;
}
