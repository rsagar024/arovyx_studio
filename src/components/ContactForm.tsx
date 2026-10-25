"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Send } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

interface FormState {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const EMPTY: FormState = { name: "", email: "", subject: "", message: "" };

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-accent-500/60 focus:outline-none";

export default function ContactForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [sending, setSending] = useState(false);

  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (form.name.trim().length < 2) return toast.error("Please enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return toast.error("Please enter a valid email.");
    if (form.subject.trim().length < 2) return toast.error("Please add a subject.");
    if (form.message.trim().length < 10) return toast.error("Message must be at least 10 characters.");

    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        toast.error(payload.error ?? "Something went wrong. Please try again.");
        return;
      }

      toast.success("Message sent — talk soon!");
      setForm(EMPTY);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="mb-1.5 block text-xs uppercase tracking-micro text-[var(--muted)]">
            Name
          </label>
          <input id="contact-name" name="name" type="text" autoComplete="name" value={form.name} onChange={set("name")} className={fieldClass} placeholder="Ada Lovelace" />
        </div>
        <div>
          <label htmlFor="contact-email" className="mb-1.5 block text-xs uppercase tracking-micro text-[var(--muted)]">
            Email
          </label>
          <input id="contact-email" name="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} className={fieldClass} placeholder="ada@example.com" />
        </div>
      </div>

      <div>
        <label htmlFor="contact-subject" className="mb-1.5 block text-xs uppercase tracking-micro text-[var(--muted)]">
          Subject
        </label>
        <input id="contact-subject" name="subject" type="text" value={form.subject} onChange={set("subject")} className={fieldClass} placeholder="Project inquiry" />
      </div>

      <div>
        <label htmlFor="contact-message" className="mb-1.5 block text-xs uppercase tracking-micro text-[var(--muted)]">
          Message
        </label>
        <textarea id="contact-message" name="message" rows={6} value={form.message} onChange={set("message")} className={cn(fieldClass, "resize-y")} placeholder="Tell me what you're building…" />
      </div>

      <button
        type="submit"
        disabled={sending}
        className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-3 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Sending…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" aria-hidden />
            Send message
          </>
        )}
      </button>
    </form>
  );
}
