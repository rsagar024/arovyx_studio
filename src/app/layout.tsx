import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import AdminShortcut from "@/components/AdminShortcut";
import { getSiteConfig } from "@/lib/projects";
import { DEFAULT_OG_IMAGE } from "@/lib/seo";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Site-level SEO defaults (spec §9 / Phase 7.3). Titles follow the editable
 * SiteConfig name; pages override title/description/canonical/openGraph.
 * The default OG image is served by app/og/route.tsx.
 */
export async function generateMetadata(): Promise<Metadata> {
  const config = await getSiteConfig();
  const siteName = config.siteName || "Arovyx Studio";
  const description =
    config.tagline
      ? `${siteName} — ${config.tagline}`
      : `${siteName} — a developer showcase of apps, games, packages and plugins, powered by NVIDIA NIM.`;

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: siteName, template: `%s · ${siteName}` },
    description,
    applicationName: siteName,
    // favicon / apple-touch icon come from app/icon.png, app/apple-icon.png, app/favicon.ico
    appleWebApp: { title: siteName, capable: true, statusBarStyle: "black-translucent" },
    // No site-wide canonical: it would be inherited by every page that
    // doesn't set its own. Pages set theirs via pageMetadata().
    openGraph: {
      type: "website",
      siteName,
      locale: "en_US",
      title: siteName,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: siteName, description, images: [DEFAULT_OG_IMAGE.url] },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07090b" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
  ],
  colorScheme: "dark light",
};

// Applies the saved theme before paint to avoid a flash of the wrong theme.
const themeScript = `(function(){try{var r=document.documentElement;var t=localStorage.getItem("arovyx-theme");if(t==="light"){r.classList.add("light");r.classList.remove("dark")}else{r.classList.add("dark");r.classList.remove("light")}}catch(e){document.documentElement.classList.add("dark")}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&display=swap"
          rel="stylesheet"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Without JS the scroll-reveal observer never runs — show content as-is. */}
        <noscript
          dangerouslySetInnerHTML={{
            __html: "<style>[data-reveal]{opacity:1!important;transform:none!important}</style>",
          }}
        />
      </head>
      <body className="relative min-h-screen font-body">
        <AdminShortcut />
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            // CSS vars so toasts follow the light/dark theme
            style: {
              background: "var(--toast-bg)",
              color: "var(--fg)",
              border: "1px solid var(--border)",
            },
            success: { iconTheme: { primary: "#22d3ee", secondary: "var(--toast-bg)" } },
          }}
        />
      </body>
    </html>
  );
}
