"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Hidden admin entry point (spec §6): pressing Ctrl+Shift+A (Cmd+Shift+A on
 * macOS) anywhere on the site opens the studio login. Renders nothing —
 * the panel stays undiscoverable.
 */
export default function AdminShortcut() {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        (event.key === "A" || event.key === "a")
      ) {
        event.preventDefault();
        router.push("/studio");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
}
