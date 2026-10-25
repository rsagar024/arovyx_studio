"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import {
  FolderKanban,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import SkipLink from "@/components/SkipLink";
import ThemeToggle from "@/components/ThemeToggle";
import BrandMark from "@/components/BrandMark";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/studio/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/studio/projects", label: "Projects", icon: FolderKanban },
  { href: "/studio/add", label: "Add Project", icon: Sparkles },
  { href: "/studio/messages", label: "Messages", icon: Inbox },
  { href: "/studio/settings", label: "Settings", icon: Settings },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Studio" className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              active
                ? "border border-accent-500/30 bg-accent-400/10 text-accent-600 dark:text-accent-400"
                : "border border-transparent text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--fg)]"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Authenticated studio chrome: sidebar + top bar + logout (spec §6.3). */
export default function StudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuButton = useRef<HTMLButtonElement | null>(null);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Escape closes the drawer and returns focus to its toggle.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDrawerOpen(false);
      menuButton.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  async function onLogout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const res = await fetch("/api/admin/logout", { method: "POST" });
      if (!res.ok) throw new Error("logout failed");
      router.push("/studio");
      router.refresh();
    } catch {
      toast.error("Couldn't sign out — try again.");
      setSigningOut(false);
    }
  }

  const sidebarInner = (
    <>
      <div className="flex items-center gap-2 px-1 font-display text-base font-semibold tracking-tight">
        <BrandMark size={32} className="h-8 w-8" />
        Arovyx <span className="text-accent-600 dark:text-accent-400">Studio</span>
        <span className="ml-auto rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-micro text-[var(--muted)]">
          Console
        </span>
      </div>

      <div className="mt-8 flex-1">
        <NavLinks pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
      </div>

      <button
        type="button"
        onClick={onLogout}
        disabled={signingOut}
        className="mt-6 flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--muted)] transition-colors hover:border-red-500/40 hover:text-red-500 dark:hover:text-red-300 disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        {signingOut ? "Signing out…" : "Log out"}
      </button>
    </>
  );

  return (
    <div className="flex min-h-screen">
      <SkipLink />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-[var(--border)] bg-[rgb(var(--bg-rgb)/0.90)] p-5 backdrop-blur-xl lg:flex">
        {sidebarInner}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div id="studio-drawer" className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--bg)] p-5">
            {sidebarInner}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[rgb(var(--bg-rgb)/0.80)] px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              ref={menuButton}
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label={drawerOpen ? "Close menu" : "Open menu"}
              aria-expanded={drawerOpen}
              aria-controls="studio-drawer"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition-colors hover:text-[var(--fg)] lg:hidden"
            >
              {drawerOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
            </button>
            <p className="micro-label">Hidden admin console</p>
          </div>
          <ThemeToggle />
        </header>

        <main id="main" tabIndex={-1} className="flex-1 px-4 py-8 sm:px-6 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
