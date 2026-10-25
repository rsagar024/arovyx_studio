import { cn } from "@/lib/utils";

/**
 * The Arovyx "AX" logo mark (transparent PNG, works on light and dark).
 * Decorative: the "Arovyx Studio" wordmark beside it carries the name.
 */
export default function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/arovyx-mark-192.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("shrink-0 select-none object-contain", className)}
      draggable={false}
    />
  );
}
