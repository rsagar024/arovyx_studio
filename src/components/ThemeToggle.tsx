"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Mode = "dark" | "light";

const STORAGE_KEY = "arovyx-theme";
/** Fired on window when any toggle changes the theme, so every instance stays in sync. */
const THEME_EVENT = "arovyx-theme";

function currentMode(): Mode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function applyMode(mode: Mode) {
  const root = document.documentElement;
  root.classList.toggle("light", mode === "light");
  root.classList.toggle("dark", mode === "dark");
}

export default function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("dark");

  useEffect(() => {
    setMode(currentMode());

    // Another toggle on this page (e.g. desktop vs mobile navbar).
    const onTheme = (event: Event) => setMode((event as CustomEvent<Mode>).detail);
    // Another tab changed the theme.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next: Mode = event.newValue === "light" ? "light" : "dark";
      applyMode(next);
      setMode(next);
    };

    window.addEventListener(THEME_EVENT, onTheme);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(THEME_EVENT, onTheme);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggle = () => {
    const next: Mode = mode === "dark" ? "light" : "dark";
    applyMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
    setMode(next);
    window.dispatchEvent(new CustomEvent<Mode>(THEME_EVENT, { detail: next }));
  };

  const label = `Switch to ${mode === "dark" ? "light" : "dark"} theme`;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={
        className ??
        "flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] transition-colors hover:border-accent-500/50 hover:text-accent-500"
      }
    >
      {mode === "dark" ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </button>
  );
}
