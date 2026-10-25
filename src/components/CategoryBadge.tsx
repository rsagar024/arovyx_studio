import { CATEGORY_META, cn } from "@/lib/utils";
import type { Category } from "@/lib/validators";

export default function CategoryBadge({
  category,
  className,
}: {
  category: Category;
  className?: string;
}) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        meta.chip,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}
