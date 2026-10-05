import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getDocumentTemplate } from "@/lib/finance/document-templates";
import { renderInvoicePdf } from "@/lib/finance/invoice-pdf";

export async function GET(_request:NextRequest,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;
  const supabase=await createClient();
  const {data:userData}=await supabase.auth.getUser();
  if(!userData.user)return new NextResponse("Unauthorized",{status:401});

  const [{data:rawInvoice,error},{data:settings}]=await Promise.all([
    supabase.from("invoices").select("*,clients(*),projects(name),invoice_contents(*),payments(*),organizations(*)").eq("id",id).maybeSingle(),
    supabase.from("workspace_settings").select("*").eq("id",true).maybeSingle(),
  ]);
  if(error||!rawInvoice)return new NextResponse("Invoice not found",{status:404});

  const live:any=rawInvoice;
  const issuedVersionNumber=live.issued_version?Number(live.issued_version):null;
  const {data:issuedVersion}=issuedVersionNumber
    ? await supabase.from("invoice_versions").select("version_number,snapshot,snapshot_hash").eq("invoice_id",id).eq("version_number",issuedVersionNumber).maybeSingle()
    : {data:null};

  const snapshot:any=issuedVersion?.snapshot;
  const invoice:any=snapshot?.invoice?{...live,...snapshot.invoice}:live;
  const client:any=snapshot?.client??live.clients??{};
  const organization:any=snapshot?.organization??live.organizations??settings??{};
  const project:any=snapshot?.project??live.projects??null;
  const contents:any[]=[...(snapshot?.contents??live.invoice_contents??[])].sort((a:any,b:any)=>Number(a.position??0)-Number(b.position??0));
  const templateKey=getDocumentTemplate(organization.invoice_template_key,"invoice")?.key||"legacy_elle";

  const bytes=await renderInvoicePdf({
    invoice,
    organization,
    client,
    projectName:project?.name??live.projects?.name??"",
    contents,
    templateKey,
  });

  if(issuedVersion){
    const checksum=createHash("sha256").update(bytes).digest("hex");
    const versionNumber=Number(issuedVersion.version_number||invoice.issued_version||1);
    const {data:document}=await supabase.from("documents").select("id").eq("invoice_id",id).eq("document_type","invoice_pdf").eq("version_number",versionNumber).maybeSingle();
    if(document?.id){
      const safeOrg=String(organization.name||organization.legal_name||"Invoice").replace(/[^a-z0-9]+/gi,"-");
      const fileName=`INV_${invoice.invoice_number}-${safeOrg}.pdf`;
      const filePath=`organizations/${invoice.organization_id}/invoices/${invoice.id}/v${versionNumber}.pdf`;
      const upload=await supabase.storage.from("finos-documents").upload(filePath,bytes,{contentType:"application/pdf",upsert:true});
      const stored=!upload.error;
      const generatedAt=new Date().toISOString();
      await supabase.from("documents").update({
        status:stored?"stored":"generated",
        file_path:stored?filePath:"",
        file_name:fileName,
        storage_bucket:"finos-documents",
        generated_at:generatedAt,
        checksum_sha256:checksum,
        source_hash:issuedVersion.snapshot_hash,
        template_key:templateKey,
        size_bytes:bytes.length,
      }).eq("id",document.id);
      await supabase.from("document_versions").upsert({
        document_id:document.id,
        version_number:versionNumber,
        file_path:stored?filePath:null,
        file_name:fileName,
        storage_bucket:"finos-documents",
        mime_type:"application/pdf",
        size_bytes:bytes.length,
        checksum_sha256:checksum,
        generated_at:generatedAt,
        generated_by:userData.user.id,
        metadata:{source_hash:issuedVersion.snapshot_hash,template_key:templateKey,storage_error:upload.error?.message??null},
      },{onConflict:"document_id,version_number"});
    }
  }

  const safeOrg=String(organization.name||organization.legal_name||"Invoice").replace(/[^a-z0-9]+/gi,"-");
  return new NextResponse(bytes,{headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":`attachment; filename="INV_${invoice.invoice_number}-${safeOrg}.pdf"`,
    "Cache-Control":"private, no-store",
  }});
}
