/**
 * Re-mounts on every navigation, so each public page fades and rises in.
 * A CSS animation (not JS) so content shows on first paint, before
 * hydration; it ends on `transform: none` so nothing inside is trapped
 * in a new containing block.
 */
export default function PublicTemplate({ children }: { children: React.ReactNode }) {
  return <div className="motion-safe:animate-page-in">{children}</div>;
}
