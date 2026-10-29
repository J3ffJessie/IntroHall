"use client";

// Last-resort boundary for errors in the root layout.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <h1>Something went wrong</h1>
        <p>Please try again. If it keeps happening, reload the page.</p>
        <button type="button" onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
