"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Check,
  Copy,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Reply,
  RotateCw,
  Search,
  Trash2,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface Message {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface InboxState {
  status: "loading" | "ready" | "error";
  messages: Message[];
}

type Filter = "all" | "unread";

/**
 * Studio → Messages (spec §6D): contact-form inbox with read/unread
 * states, a detail view, reply-by-mail and two-step delete.
 */
export default function MessagesInbox() {
  const [state, setState] = useState<InboxState>({ status: "loading", messages: [] });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/messages");
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        messages?: Message[];
        error?: string;
      };
      if (!res.ok || !payload.ok || !payload.messages) {
        throw new Error(payload.error ?? "Failed to load messages");
      }
      setState({ status: "ready", messages: payload.messages });
    } catch (err) {
      setState((prev) => ({ status: "error", messages: prev.messages }));
      toast.error(err instanceof Error ? err.message : "Failed to load messages");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unreadCount = state.messages.filter((m) => !m.isRead).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.messages.filter((m) => {
      // Keep the open message listed under "Unread" even after opening marks it read.
      if (filter === "unread" && m.isRead && m.id !== selectedId) return false;
      if (!needle) return true;
      return (
        m.name.toLowerCase().includes(needle) ||
        m.email.toLowerCase().includes(needle) ||
        m.subject.toLowerCase().includes(needle) ||
        m.message.toLowerCase().includes(needle)
      );
    });
  }, [state.messages, filter, query, selectedId]);

  const selected = state.messages.find((m) => m.id === selectedId) ?? null;

  /** PATCH isRead, optimistically; reverts on failure. */
  async function setRead(message: Message, isRead: boolean, quiet = false) {
    const apply = (value: boolean) =>
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) => (m.id === message.id ? { ...m, isRead: value } : m)),
      }));

    apply(isRead);
    try {
      const res = await fetch(`/api/admin/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "Update failed");
      if (!quiet) toast.success(isRead ? "Marked as read." : "Marked as unread.");
    } catch (err) {
      apply(message.isRead);
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  function open(message: Message) {
    setSelectedId(message.id);
    setConfirmDeleteId(null);
    setCopied(false);
    if (!message.isRead) void setRead(message, true, true);
  }

  async function confirmDelete(message: Message) {
    if (confirmDeleteId !== message.id) {
      setConfirmDeleteId(message.id);
      return;
    }

    setBusyId(message.id);
    try {
      const res = await fetch(`/api/admin/messages/${message.id}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "Delete failed");

      // Select the next message in the visible list (or the previous one).
      const index = visible.findIndex((m) => m.id === message.id);
      const next = visible[index + 1] ?? visible[index - 1] ?? null;
      setState((prev) => ({
        ...prev,
        messages: prev.messages.filter((m) => m.id !== message.id),
      }));
      setSelectedId(next?.id ?? null);
      if (next && !next.isRead) void setRead(next, true, true);
      toast.success("Message deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  }

  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      toast.success("Email copied.");
    } catch {
      toast.error("Couldn't copy — select it manually.");
    }
  }

  if (state.status === "loading") {
    return (
      <div className="glass flex min-h-[200px] items-center justify-center rounded-2xl">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" aria-label="Loading messages" />
      </div>
    );
  }

  if (state.status === "error" && state.messages.length === 0) {
    return (
      <div className="glass flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-2xl p-10 text-center">
        <p className="text-sm text-[var(--muted)]">Couldn&apos;t load messages.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--fg)] transition-colors hover:border-accent-500/50"
        >
          <RotateCw className="h-4 w-4" aria-hidden />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[var(--muted)]">
            <span className="font-semibold text-[var(--fg)]">{state.messages.length}</span> total ·{" "}
            <span className="font-semibold text-accent-600 dark:text-accent-400">{unreadCount}</span>{" "}
            unread
          </p>
          <div
            role="group"
            aria-label="Filter messages"
            className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--panel)] p-0.5"
          >
            {(["all", "unread"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                  filter === value
                    ? "bg-accent-400/15 text-accent-600 dark:text-accent-400"
                    : "text-[var(--muted)] hover:text-[var(--fg)]"
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, text…"
            aria-label="Search messages"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] py-2 pl-9 pr-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-accent-500/60 focus:outline-none"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="glass flex min-h-[200px] flex-col items-center justify-center rounded-2xl p-10 text-center">
          <Inbox className="h-6 w-6 text-[var(--muted)]" aria-hidden />
          <p className="mt-3 text-sm text-[var(--muted)]">
            {query
              ? `No messages match “${query}”.`
              : filter === "unread"
                ? "No unread messages."
                : "No messages yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* list */}
          <ul className="space-y-2" aria-label="Messages">
            {visible.map((m) => {
              const active = m.id === selectedId;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => open(m)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "glass w-full rounded-xl p-4 text-left transition-colors",
                      active
                        ? "border-accent-500/50 bg-accent-400/5"
                        : "hover:border-accent-500/30"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          m.isRead ? "bg-transparent" : "bg-accent-500 shadow-glow"
                        )}
                        aria-label={m.isRead ? undefined : "Unread"}
                      />
                      <span
                        className={cn(
                          "truncate text-sm",
                          m.isRead ? "text-[var(--muted)]" : "font-semibold text-[var(--fg)]"
                        )}
                      >
                        {m.name}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-[var(--muted)]">
                        {formatDate(m.createdAt)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-1 truncate pl-4 text-sm",
                        m.isRead ? "text-[var(--muted)]" : "font-semibold text-[var(--fg)]"
                      )}
                    >
                      {m.subject}
                    </p>
                    <p className="mt-0.5 truncate pl-4 text-xs text-[var(--muted)]">{m.message}</p>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* detail */}
          <section
            aria-label="Message detail"
            className="glass min-h-[240px] rounded-2xl p-5 sm:p-6 lg:sticky lg:top-24 lg:self-start"
          >
            {selected ? (
              <article>
                <header className="border-b border-[var(--border)] pb-4">
                  <h2 className="font-display text-xl font-semibold tracking-tight">
                    {selected.subject}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium">{selected.name}</span>
                    <a
                      href={`mailto:${selected.email}`}
                      className="text-accent-600 hover:underline dark:text-accent-400"
                    >
                      {selected.email}
                    </a>
                    <button
                      type="button"
                      onClick={() => void copyEmail(selected.email)}
                      aria-label="Copy email address"
                      className="inline-flex items-center rounded p-1 text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {new Date(selected.createdAt).toLocaleString()}
                  </p>
                </header>

                <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {selected.message}
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
                  <a
                    href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.subject}`)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-xs font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow"
                  >
                    <Reply className="h-3.5 w-3.5" aria-hidden />
                    Reply
                  </a>
                  <button
                    type="button"
                    onClick={() => void setRead(selected, !selected.isRead)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:border-accent-500/40 hover:text-accent-600 dark:hover:text-accent-400"
                  >
                    {selected.isRead ? (
                      <>
                        <Mail className="h-3.5 w-3.5" aria-hidden />
                        Mark unread
                      </>
                    ) : (
                      <>
                        <MailOpen className="h-3.5 w-3.5" aria-hidden />
                        Mark read
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmDelete(selected)}
                    disabled={busyId === selected.id}
                    className={cn(
                      "ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60",
                      confirmDeleteId === selected.id
                        ? "border-red-500/50 bg-red-400/10 text-red-600 dark:text-red-300"
                        : "border-[var(--border)] text-[var(--muted)] hover:border-red-500/40 hover:text-red-500 dark:hover:text-red-300"
                    )}
                  >
                    {busyId === selected.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {confirmDeleteId === selected.id ? "Confirm delete" : "Delete"}
                  </button>
                </div>
              </article>
            ) : (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
                <MailOpen className="h-6 w-6 text-[var(--muted)]" aria-hidden />
                <p className="mt-3 text-sm text-[var(--muted)]">Select a message to read it.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
