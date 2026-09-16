"use client";

// Catches failures in the root layout itself, which app/error.js cannot.
// Kept dependency-free so it renders even when the rest of the app cannot.
export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          background: "radial-gradient(120% 90% at 50% -10%, #223258 0%, #0e1830 55%, #080d19 100%)",
          color: "#e6edf7",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            borderRadius: 16,
            padding: "1.75rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#fbbf24" }}>
            Beacon could not start
          </div>
          <p style={{ marginTop: 10, fontSize: 14, color: "rgba(230,237,247,0.75)", lineHeight: 1.5 }}>
            {error?.message || "An unexpected error occurred while loading the application."}
          </p>
          {error?.digest ? (
            <p style={{ marginTop: 8, fontSize: 11, fontFamily: "ui-monospace, monospace", color: "rgba(230,237,247,0.45)" }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            onClick={() => reset()}
            style={{
              marginTop: 18,
              padding: "0.6rem 1.1rem",
              borderRadius: 8,
              border: 0,
              background: "#22d3ee",
              color: "#060a14",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
