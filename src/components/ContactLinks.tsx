"use client";

import { useState } from "react";
import { Check, Copy, Github, Instagram, Linkedin, Mail } from "lucide-react";
import toast from "react-hot-toast";

interface Props {
  email: string;
  githubUrl: string;
  linkedinUrl: string;
  instagramUrl: string;
}

export default function ContactLinks({ email, githubUrl, linkedinUrl, instagramUrl }: Props) {
  const [copied, setCopied] = useState(false);

  const cards = [
    { href: email ? `mailto:${email}` : "", icon: Mail, label: "Email", value: email || "Not set" },
    { href: githubUrl, icon: Github, label: "GitHub", value: shorten(githubUrl) },
    { href: linkedinUrl, icon: Linkedin, label: "LinkedIn", value: shorten(linkedinUrl) },
    { href: instagramUrl, icon: Instagram, label: "Instagram", value: shorten(instagramUrl) },
  ].filter((card) => card.href.length > 0);

  const copyEmail = async () => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      toast.success("Email copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — please copy manually.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ href, icon: Icon, label, value }) => (
          <a
            key={label}
            href={href}
            target={href.startsWith("mailto:") ? undefined : "_blank"}
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 transition-all hover:-translate-y-0.5 hover:border-accent-500/50 hover:shadow-glow"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)] text-accent-600 dark:text-accent-400">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{label}</span>
              <span className="block truncate text-xs text-[var(--muted)]">{value}</span>
            </span>
          </a>
        ))}
      </div>

      {email && (
        <button
          type="button"
          onClick={copyEmail}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 text-sm transition-colors hover:border-accent-500/60"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-500" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Copied!" : "Copy email address"}
        </button>
      )}
    </div>
  );
}

function shorten(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "");
    return `${parsed.hostname.replace("www.", "")}${path}`;
  } catch {
    return url;
  }
}
