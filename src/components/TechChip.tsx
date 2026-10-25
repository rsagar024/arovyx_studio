import { cn } from "@/lib/utils";

export default function TechChip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 font-mono text-[11px] text-[var(--muted)]",
        className
      )}
    >
      {label}
    </span>
  );
}
