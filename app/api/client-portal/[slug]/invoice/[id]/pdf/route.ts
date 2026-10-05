import { NextRequest,NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";
import { getDocumentTemplate } from "@/lib/finance/document-templates";
import { renderInvoicePdf } from "@/lib/finance/invoice-pdf";

export async function GET(request:NextRequest,context:{params:Promise<{slug:string;id:string}>}){
  const {slug,id}=await context.params;
  const session=request.cookies.get("portal_session")?.value||"";
  if(!session)return new NextResponse("Unauthorized",{status:401});

  const supabase=createServiceClient();
  const sessionHash=hashPortalSession(session);
  const [{data,error},{data:orgRaw}]=await Promise.all([
    supabase.rpc("get_client_portal",{p_slug:slug,p_session:sessionHash}),
    supabase.rpc("get_client_portal_organization",{p_slug:slug,p_session:sessionHash}),
  ]);
  if(error||!data)return new NextResponse("Portal unavailable",{status:401});

  const portalInvoice=(data as any).invoices.find((row:any)=>row.id===id);
  if(!portalInvoice)return new NextResponse("Invoice not found",{status:404});

  await supabase.rpc("log_client_portal_activity",{
    p_slug:slug,
    p_session:sessionHash,
    p_action:"invoice_pdf_downloaded",
    p_resource_type:"invoice",
    p_resource_id:id,
  });

  let organization:any=orgRaw||{};
  let client:any=(data as any).client||{};
  let invoice:any=portalInvoice;
  let projectName=portalInvoice.project_name||"";
  let contents:any[]=[...(portalInvoice.contents||[])];

  const {data:liveMeta}=await supabase.from("invoices").select("issued_version,source_total").eq("id",id).maybeSingle();
  if(liveMeta?.issued_version){
    const {data:issued}=await supabase.from("invoice_versions").select("snapshot").eq("invoice_id",id).eq("version_number",liveMeta.issued_version).maybeSingle();
    const snapshot:any=issued?.snapshot;
    if(snapshot?.invoice){
      invoice={...portalInvoice,...snapshot.invoice};
      client=snapshot.client??client;
      organization=snapshot.organization??organization;
      projectName=snapshot.project?.name??projectName;
      contents=[...(snapshot.contents??contents)];
    }
  }
  if(invoice.source_total==null&&liveMeta?.source_total!=null)invoice.source_total=liveMeta.source_total;

  const templateKey=getDocumentTemplate(organization.invoice_template_key,"invoice")?.key||"legacy_elle";
  const bytes=await renderInvoicePdf({
    invoice,
    organization,
    client,
    projectName,
    contents,
    templateKey,
  });

  const safeOrg=String(organization.name||organization.legal_name||"Invoice").replace(/[^a-z0-9]+/gi,"-");
  return new NextResponse(bytes,{headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":`attachment; filename="INV_${invoice.invoice_number}-${safeOrg}.pdf"`,
    "Cache-Control":"private, no-store",
  }});
}
