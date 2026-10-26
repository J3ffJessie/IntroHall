import type { ReactNode } from "react";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 [&_h1]:mb-2 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:text-xl
                     [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3">
      {children}
    </main>
  );
}
