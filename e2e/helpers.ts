import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Reads the newest OTP sent to `email` from the local Supabase mail catcher. */
export async function latestOtp(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages?.length) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json();
      const code = String(msg.Text).match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No OTP email for ${email}`);
}

export async function signInWithOtp(page: Page, email: string) {
  await page.goto("/login?next=/profile");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel(/Code sent to/).fill(await latestOtp(email));
  await page.getByRole("button", { name: "Verify" }).click();
  // Match the pathname: the login URL itself (/login?next=/profile) also ends in "/profile".
  await expect(page).toHaveURL((url) => url.pathname === "/profile");
}

export async function expectNoSeriousA11yViolations(page: Page) {
  // Without this, axe can sample colors mid-transition (e.g. right after switching color scheme).
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const details = serious.flatMap((v) =>
    v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} — ${n.failureSummary?.split("\n").slice(1).join(" ")}`));
  expect(serious, `${page.url()}\n${details.join("\n")}`).toEqual([]);
}
