import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: document, error } = await supabase
    .from("documents")
    .select("id,document_type,file_path,file_name,storage_bucket,invoice_id,payment_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !document) return new NextResponse("Document not found", { status: 404 });

  if (document.file_path) {
    const signed = await supabase.storage
      .from(document.storage_bucket || "finos-documents")
      .createSignedUrl(document.file_path, 60);

    if (!signed.error && signed.data?.signedUrl) {
      return NextResponse.redirect(signed.data.signedUrl);
    }
  }

  if (document.document_type === "invoice_pdf" && document.invoice_id) {
    return NextResponse.redirect(new URL(`/api/invoices/${document.invoice_id}/pdf`, _request.url));
  }

  if (document.document_type === "receipt_pdf" && document.payment_id) {
    return NextResponse.redirect(new URL(`/api/payments/${document.payment_id}/receipt`, _request.url));
  }

  if (document.document_type === "statement_pdf" && document.client_id) {
    return NextResponse.redirect(new URL(`/api/statements/${document.client_id}/pdf`, _request.url));
  }

  return new NextResponse("Document is not available yet", { status: 404 });
}