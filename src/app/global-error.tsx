"use client";

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it can't rely on the app's CSS or providers.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07090b",
          color: "#e6e8eb",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 440 }}>
          <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>Temporarily unavailable</h1>
          <p style={{ color: "#9aa3ad", fontSize: 14, lineHeight: 1.5 }}>
            Arovyx Studio couldn&apos;t load right now, most likely because the database is
            unreachable. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "10px 20px",
              borderRadius: 8,
              border: 0,
              background: "#06b6d4",
              color: "#07090b",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: 16, fontSize: 11, color: "#9aa3ad" }}>Reference: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
