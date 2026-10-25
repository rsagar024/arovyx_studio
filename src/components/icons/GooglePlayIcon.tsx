/** Google Play mark (four-colour triangle) — lucide-react has no brand icons. */
export default function GooglePlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path fill="#00D7FE" d="M3.6 1.8c-.3.3-.5.8-.5 1.4v17.6c0 .6.2 1.1.5 1.4l.1.1 9.8-9.8v-.2L3.7 1.7z" />
      <path fill="#FFCE00" d="m16.8 15.4-3.3-3.3v-.2l3.3-3.3.1.1 3.9 2.2c1.1.6 1.1 1.7 0 2.3l-3.9 2.2z" />
      <path fill="#FF3A44" d="M16.9 15.3 13.5 12l-9.9 10.2c.4.4 1 .4 1.7.1z" />
      <path fill="#00F076" d="M16.9 8.7 5.3 2.1c-.7-.4-1.3-.3-1.7.1l9.9 9.8z" />
    </svg>
  );
}
