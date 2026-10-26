import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

// DRAFT for the pilot. Must be reviewed by counsel before the EU launch (plan §8).
export default function PrivacyPage() {
  return (
    <article>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted">Draft — last updated October 26, 2026</p>

      <h2>What we collect</h2>
      <ul>
        <li>Account: your email, name, and optional headline, company, photo and links.</li>
        <li>Per event: your bio, what you&apos;re looking for, and the interests you pick.</li>
        <li>Connections and messages you send to other attendees.</li>
        <li>Reports you file, including a copy of the reported message.</li>
      </ul>

      <h2>Who sees it</h2>
      <ul>
        <li>Other attendees of the same event see your event profile and interests unless you hide your profile.</li>
        <li>Organizers see your name, company and headline, and when you joined. They see interests only as totals,
            never per person, and they never read your messages, except a message you or someone else reports.</li>
        <li>We do not sell your data.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Messages are deleted 30 days after an event ends by default (organizers can choose 7–90 days). Messages
        under an open report are kept until the report is resolved. You can delete your account at any time.
      </p>

      <h2>Contact</h2>
      <p>Questions or deletion requests: privacy@introhall.com.</p>
    </article>
  );
}
