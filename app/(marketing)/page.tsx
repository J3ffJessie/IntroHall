import Link from "next/link";
import { PROTOCOL, ROOT_DOMAIN } from "@/lib/env";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4">
      <h1 className="text-4xl font-bold tracking-tight">IntroHall</h1>
      <p className="text-lg text-muted">
        Attendees scan a QR code, pick their interests, and meet the people they came to meet.
      </p>
      <Link
        href={`${PROTOCOL}://app.${ROOT_DOMAIN}/login`}
        className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-primary-fg hover:bg-primary-hover"
      >
        Organizer sign in
      </Link>
    </main>
  );
}
