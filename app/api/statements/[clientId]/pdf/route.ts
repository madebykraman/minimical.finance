import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { renderStatementPdf } from "@/lib/finance/statement-pdf";

function iso(date: Date) { return date.toISOString().slice(0, 10); }

function periodBounds(request: NextRequest) {
  const startParam = request.nextUrl.searchParams.get("start");
  const endParam = request.nextUrl.searchParams.get("end");
  if (startParam && endParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startParam) || !/^\d{4}-\d{2}-\d{2}$/.test(endParam) || startParam > endParam) return null;
    return { start: startParam, end: endParam, label: `${startParam} — ${endParam}` };
  }

  const period = request.nextUrl.searchParams.get("period") || "all";
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  let start: Date;
  let label: string;

  if (period === "month") { start = new Date(today.getFullYear(), today.getMonth(), 1); label = "This month"; }
  else if (period === "3months") { start = new Date(today.getFullYear(), today.getMonth() - 2, 1); label = "Last 3 months"; }
  else if (period === "6months") { start = new Date(today.getFullYear(), today.getMonth() - 5, 1); label = "Last 6 months"; }
  else if (period === "fy") { const fy = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1; start = new Date(fy, 3, 1); label = `FY ${fy}-${String(fy + 1).slice(-2)}`; }
  else { start = new Date(2000, 0, 1); label = "All time"; }

  return { start: iso(start), end: iso(end), label };
}

export async function GET(request: NextRequest, context: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await context.params;
  const range = periodBounds(request);
  if (!range) return new NextResponse("Invalid statement period", { status: 400 });

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return new NextResponse("Unauthorized", { status: 401 });

  const [{ data: client, error: clientError }, { data: ledger, error: ledgerError }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", clientId).maybeSingle(),
    supabase.rpc("statement_ledger", { p_client_id: clientId, p_start: range.start, p_end: range.end }),
  ]);
  if (clientError || !client) return new NextResponse("Client not found", { status: 404 });
  if (ledgerError) return new NextResponse("Could not generate statement", { status: 500 });

  const { data: organization } = await supabase.from("organizations").select("*").eq("id", client.organization_id).maybeSingle();
  if (!organization) return new NextResponse("Organisation not found", { status: 404 });

  const rows = (ledger ?? []).map(row => ({
    transaction_date: row.transaction_date,
    transaction_type: row.transaction_type,
    reference: row.reference,
    debit: Number(row.debit || 0),
    credit: Number(row.credit || 0),
    running_balance: Number(row.running_balance || 0),
  }));
  const openingBalance = rows.length ? rows[0].running_balance - rows[0].debit + rows[0].credit : 0;

  const sourceHash = createHash("sha256").update(JSON.stringify({
    template: "statement-v1", clientId, organizationId: client.organization_id, start: range.start, end: range.end, rows, openingBalance,
  })).digest("hex");
  const bytes = await renderStatementPdf({ organization, client, periodLabel: range.label, periodStart: range.start, periodEnd: range.end, rows, openingBalance });
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const safeName = String(client.name || "Client").replace(/[^a-z0-9]+/gi, "-");
  const fileName = `Statement-${safeName}.pdf`;

  const { data: document } = await supabase.from("documents").select("id,version_number").eq("client_id", clientId).eq("document_type", "statement_pdf").maybeSingle();
  let documentId = document?.id ?? null;
  let versionNumber = Number(document?.version_number || 0);
  let sameSource: any = null;
  if (documentId) {
    const latest = await supabase.from("document_versions").select("version_number").eq("document_id", documentId).order("version_number", { ascending: false }).limit(1).maybeSingle();
    versionNumber = Math.max(versionNumber, Number(latest.data?.version_number || 0));
    const found = await supabase.from("document_versions").select("file_path,checksum_sha256,version_number").eq("document_id", documentId).eq("metadata->>source_hash", sourceHash).order("version_number", { ascending: false }).limit(1).maybeSingle();
    sameSource = found.data;
  }

  if (!documentId) {
    const created = await supabase.from("documents").insert({
      client_id: clientId, organization_id: client.organization_id, document_type: "statement_pdf", file_path: "", file_name: fileName, visible_to_client: true,
      description: "Canonical account statement", mime_type: "application/pdf", status: "pending", version_number: 1, template_key: "statement-v1", source_hash: sourceHash, issued_at: new Date().toISOString(),
    }).select("id").single();
    if (created.error || !created.data) return new NextResponse("Could not register statement document", { status: 500 });
    documentId = created.data.id; versionNumber = 1;
  } else if (!sameSource) {
    versionNumber += 1;
    const updated = await supabase.from("documents").update({ version_number: versionNumber, file_name: fileName, template_key: "statement-v1", source_hash: sourceHash, status: "pending", file_path: "" }).eq("id", documentId);
    if (updated.error) return new NextResponse("Could not update statement document", { status: 500 });
  }

  if (!sameSource) {
    const filePath = `organizations/${client.organization_id}/statements/${client.id}/v${versionNumber}.pdf`;
    const upload = await supabase.storage.from("finos-documents").upload(filePath, bytes, { contentType: "application/pdf", upsert: true });
    const generatedAt = new Date().toISOString();
    const stored = !upload.error;
    await supabase.from("documents").update({ status: stored ? "stored" : "generated", file_path: stored ? filePath : "", file_name: fileName, storage_bucket: "finos-documents", generated_at: generatedAt, size_bytes: bytes.length, checksum_sha256: checksum, source_hash: sourceHash, template_key: "statement-v1" }).eq("id", documentId);
    const versionWrite = await supabase.from("document_versions").insert({ document_id: documentId, version_number: versionNumber, file_path: stored ? filePath : null, file_name: fileName, storage_bucket: "finos-documents", mime_type: "application/pdf", size_bytes: bytes.length, checksum_sha256: checksum, generated_at: generatedAt, generated_by: userData.user.id, metadata: { source_hash: sourceHash, period_start: range.start, period_end: range.end, period_label: range.label, template_key: "statement-v1", storage_error: upload.error?.message ?? null } });
    if (versionWrite.error) return new NextResponse("Statement generated but version registration failed", { status: 500 });
  }

  return new NextResponse(bytes, { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "private, no-store",
  }});
}