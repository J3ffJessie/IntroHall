import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// "Download my data": everything the account holds, as one JSON file (export_my_data()).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data, error } = await supabase.rpc("export_my_data");
  if (error) return NextResponse.json({ error: "Export failed. Please try again." }, { status: 500 });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="introhall-data-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
