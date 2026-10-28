import ContactForm from "@/components/ContactForm";
import ContactLinks from "@/components/ContactLinks";
import Reveal from "@/components/Reveal";
import SplitText from "@/components/motion/SplitText";
import type { getSiteConfig } from "@/lib/projects";

type SiteConfig = Awaited<ReturnType<typeof getSiteConfig>>;

/** Home-page "Contact" section (#contact): form + direct contact cards. */
export default function ContactSection({ config }: { config: SiteConfig }) {
  return (
    <section id="contact" aria-labelledby="contact-heading" className="container-page scroll-mt-20 pt-24">
      <Reveal>
        <p className="micro-label">Say hello</p>
      </Reveal>
      <SplitText
        id="contact-heading"
        text="Contact"
        className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl"
      />
      <Reveal delay={150}>
        <p className="mt-4 max-w-2xl text-[var(--muted)]">
          Project inquiries, collaboration ideas, bug reports or just a hello — the form lands
          straight in the studio inbox.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <Reveal delay={80} variant="left">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 sm:p-8">
            <h3 id="contact-form-heading" className="mb-5 font-display text-xl font-semibold">
              Send a message
            </h3>
            <ContactForm />
          </div>
        </Reveal>

        <Reveal delay={140} variant="right">
          <div className="space-y-5">
            <h3 id="contact-links-heading" className="font-display text-xl font-semibold">
              Reach me directly
            </h3>
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
          </div>
        </Reveal>
      </div>
    </section>
  );
}
