import { getPublicEvent } from "@/lib/public-event";

// One manifest per event subdomain: each event installs as its own home-screen app (§4.3).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const data = await getPublicEvent((await params).slug);
  if (!data) return new Response("Not found", { status: 404 });
  const name = data.event.name;
  return Response.json({
    name,
    short_name: name.length > 12 ? name.slice(0, 12).trimEnd() : name,
    description: `Meet people at ${name}`,
    id: "/",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } });
}
