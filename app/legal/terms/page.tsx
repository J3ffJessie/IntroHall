import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

// DRAFT for the pilot. Must be reviewed by counsel before launch.
export default function TermsPage() {
  return (
    <article>
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted">Draft — last updated October 26, 2026</p>
      <h2>Using IntroHall</h2>
      <p>IntroHall helps conference attendees find and message each other. Be respectful: harassment, spam and
         impersonation are not allowed. Organizers and IntroHall may remove anyone who breaks these rules.</p>
      <h2>Your content</h2>
      <p>You own what you post. You let us show it to the people described in the Privacy Policy so the service works.</p>
      <h2>Organizers</h2>
      <p>Organizers are responsible for their event pages and must have the right to use the names and images they upload.</p>
      <h2>No warranty</h2>
      <p>The service is provided as is during the pilot.</p>
    </article>
  );
}
