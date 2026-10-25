import { STATUS_META, cn } from "@/lib/utils";
import type { Status } from "@/lib/validators";

export default function StatusBadge({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        meta.chip,
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5" aria-hidden>
        {status === "LIVE" && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping",
              meta.dot
            )}
          />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", meta.dot)} />
      </span>
      {meta.label}
    </span>
  );
}
