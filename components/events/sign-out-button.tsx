"use client";

/** Signs out and drops this device's offline copies of attendee pages (shared devices). */
export function SignOutButton() {
  const signOut = async () => {
    const reg = await navigator.serviceWorker?.getRegistration("/").catch(() => undefined);
    reg?.active?.postMessage("clear-cache");
    const form = document.createElement("form");
    form.method = "post";
    form.action = "/auth/signout";
    document.body.append(form);
    form.submit();
  };
  return <button type="button" onClick={signOut} className="text-sm text-muted underline hover:text-fg">Sign out</button>;
}
