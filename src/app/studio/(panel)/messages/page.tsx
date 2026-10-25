import type { Metadata } from "next";
import MessagesInbox from "@/components/studio/MessagesInbox";

export const metadata: Metadata = { title: "Messages" };

/** Studio → Messages: contact-form inbox (Phase 6D). */
export default function StudioMessagesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          Contact-form submissions, newest first.
        </p>
      </div>

      <MessagesInbox />
    </div>
  );
}
