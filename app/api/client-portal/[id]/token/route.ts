import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id,name,portal_enabled,portal_slug,portal_password_hash")
    .eq("id", id)
    .maybeSingle();

  if (clientError || !client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!client.portal_enabled) return NextResponse.json({ error: "Enable the client portal first." }, { status: 400 });
  if (!client.portal_password_hash) return NextResponse.json({ error: "Set a portal password before creating a shareable link." }, { status: 400 });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  await supabase
    .from("client_portal_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("client_id", id)
    .is("revoked_at", null);

  const { error } = await supabase.from("client_portal_tokens").insert({
    client_id: id,
    token_hash: tokenHash,
    label: "Portal access",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const origin = request.nextUrl.origin;
  return NextResponse.json({
    url: origin + "/portal/" + client.portal_slug + "?token=" + encodeURIComponent(token),
    client: client.name,
  });
}
