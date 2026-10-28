// IntroHall service worker (one per event subdomain).
// - Push: shows notifications; tapping one focuses/opens the right page.
// - Offline: network-first for the attendee pages, falling back to the last cached copy
//   (event page, matches, inbox, profile, announcements, and chats, which render their last 50 messages).
const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const CACHEABLE = [/^\/$/, /^\/home$/, /^\/me$/, /^\/inbox$/, /^\/announcements$/, /^\/chat\/[0-9a-f-]{36}$/];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== PAGES && key !== ASSETS) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
  } else if (req.mode === "navigate" && CACHEABLE.some((re) => re.test(url.pathname))) {
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req, { signal: AbortSignal.timeout(5000) });
    // Only cache real pages; redirects (e.g. to /join after sign-out) must not be served offline.
    if (res.ok && !res.redirected) cache.put(new URL(req.url).pathname, res.clone());
    return res;
  } catch {
    const hit = await cache.match(new URL(req.url).pathname);
    if (hit) return hit;
    return new Response(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>' +
      '<body style="font-family:system-ui;padding:2rem;max-width:32rem;margin:auto"><h1>You\'re offline</h1>' +
      "<p>This page hasn't been saved on this device yet. Reconnect and try again.</p></body>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* plain-text push */ }
  event.waitUntil(self.registration.showNotification(data.title || "IntroHall", {
    body: data.body || "",
    tag: data.tag,
    renotify: Boolean(data.tag),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/home" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/home", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const same = windows.find((w) => w.url === target) || windows[0];
    if (same) {
      await same.focus();
      if (same.url !== target && "navigate" in same) await same.navigate(target);
    } else {
      await self.clients.openWindow(target);
    }
  })());
});

// The page can ask us to drop cached pages (sign-out on a shared device).
self.addEventListener("message", (event) => {
  if (event.data === "clear-cache") event.waitUntil(caches.delete(PAGES));
});
