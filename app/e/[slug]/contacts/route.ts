import { NextResponse } from "next/server";
import { cleanLinks, contactsFile, isContactFormat } from "@/lib/contacts-export";
import { PROTOCOL, ROOT_DOMAIN } from "@/lib/env";
import { eventUrl } from "@/lib/hosts";
import { getPublicEvent } from "@/lib/public-event";
import { createClient } from "@/lib/supabase/server";

// Contact export: your connections at this event as a vCard (.vcf) or CSV file, with your notes.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "vcf";
  if (!isContactFormat(format)) return NextResponse.json({ error: "format must be vcf or csv" }, { status: 400 });

  const data = await getPublicEvent(slug);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const { data: rows, error } = await supabase.rpc("export_contacts", { p_event_id: data.event.id });
  if (error) {
    const forbidden = error.code === "42501";
    return NextResponse.json({ error: forbidden ? "You're not an attendee of this event" : "Export failed. Please try again." },
                             { status: forbidden ? 403 : 500 });
  }

  const base = eventUrl(slug, ROOT_DOMAIN, PROTOCOL);
  const contacts = (rows ?? []).map((r) => ({
    fullName: r.full_name ?? "",
    headline: r.headline ?? "",
    company: r.company ?? "",
    links: cleanLinks(r.links),
    connectedAt: r.connected_at,
    note: r.note,
    chatUrl: r.conversation_id ? `${base}chat/${r.conversation_id}` : null,
  }));
  const file = contactsFile(format, slug, contacts, { eventName: data.event.name, timeZone: data.event.timezone });
  return new NextResponse(file.body, {
    headers: {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "no-store",
    },
  });
}
