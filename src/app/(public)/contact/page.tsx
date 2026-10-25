import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import ContactLinks from "@/components/ContactLinks";
import Reveal from "@/components/Reveal";
import { getSiteConfig } from "@/lib/projects";
import { pageMetadata } from "@/lib/seo";

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Contact",
    description: "Get in touch with Arovyx Studio — project inquiries, collaborations and questions.",
    path: "/contact",
  });
}

export default async function ContactPage() {
  const config = await getSiteConfig();

  return (
    <div className="container-page py-16">
      <Reveal>
        <p className="micro-label">Say hello</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Contact
        </h1>
        <p className="mt-4 max-w-2xl text-[var(--muted)]">
          Project inquiries, collaboration ideas, bug reports or just a hello — the form lands
          straight in the studio inbox.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <Reveal delay={80}>
          <section
            aria-labelledby="contact-form-heading"
            className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 sm:p-8"
          >
            <h2 id="contact-form-heading" className="mb-5 font-display text-xl font-semibold">
              Send a message
            </h2>
            <ContactForm />
          </section>
        </Reveal>

        <Reveal delay={140}>
          <section aria-labelledby="contact-links-heading" className="space-y-5">
            <h2 id="contact-links-heading" className="font-display text-xl font-semibold">
              Reach me directly
            </h2>
            <ContactLinks
              email={config.email}
              githubUrl={config.githubUrl}
              linkedinUrl={config.linkedinUrl}
              instagramUrl={config.instagramUrl}
            />

            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
              <p className="micro-label">Response time</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Usually within 48 hours, Monday to Friday.
              </p>
            </div>
          </section>
        </Reveal>
      </div>
    </div>
  );
}
