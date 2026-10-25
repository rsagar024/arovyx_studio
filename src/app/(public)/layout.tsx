import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SkipLink from "@/components/SkipLink";

/** Layout for all public pages (the studio has its own shell). */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <SkipLink />
      <Navbar />
      <main id="main" tabIndex={-1} className="relative z-10 flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
