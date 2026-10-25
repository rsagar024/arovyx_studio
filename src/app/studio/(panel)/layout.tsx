import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import StudioShell from "@/components/studio/StudioShell";

export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false },
};

/**
 * Layout for every authenticated studio section (spec §6.3).
 * The login page lives outside this route group so it never gets the
 * sidebar chrome. Middleware already guards /studio/*; the session check
 * here is defense in depth.
 */
export default async function StudioPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/studio");

  return <StudioShell>{children}</StudioShell>;
}
