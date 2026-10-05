import { NextRequest,NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";
import { getDocumentTemplate } from "@/lib/finance/document-templates";
import { renderInvoicePdf } from "@/lib/finance/invoice-pdf";

function pdfResponse(bytes:Uint8Array,fileName:string){
  return new NextResponse(bytes,{headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":`attachment; filename="${fileName.replace(/["\\]/g,"-")}"`,
    "Cache-Control":"private, no-store",
  }});
}

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

  const payload:any=data;
  const portalInvoice=(payload.invoices||[]).find((row:any)=>row.id===id);
  if(!portalInvoice)return new NextResponse("Invoice not found",{status:404});

  await supabase.rpc("log_client_portal_activity",{
    p_slug:slug,
    p_session:sessionHash,
    p_action:"invoice_pdf_downloaded",
    p_resource_type:"invoice",
    p_resource_id:id,
  });

  let organization:any=orgRaw||{};
  let client:any=payload.client||{};
  let invoice:any=portalInvoice;
  let projectName=portalInvoice.project_name||"";
  let contents:any[]=[...(portalInvoice.contents||[])];

  const {data:liveMeta}=await supabase.from("invoices")
    .select("issued_version,source_total,organization_id,client_id,issued_at")
    .eq("id",id)
    .maybeSingle();

  const versionNumber=liveMeta?.issued_version?Number(liveMeta.issued_version):null;
  let issued:any=null;
  let document:any=null;

  if(versionNumber){
    const [{data:version},{data:doc}]=await Promise.all([
      supabase.from("invoice_versions")
        .select("snapshot,snapshot_hash")
        .eq("invoice_id",id)
        .eq("version_number",versionNumber)
        .maybeSingle(),
      supabase.from("documents")
        .select("id,status,file_path,file_name,storage_bucket")
        .eq("invoice_id",id)
        .eq("document_type","invoice_pdf")
        .eq("version_number",versionNumber)
        .maybeSingle(),
    ]);
    issued=version;
    document=doc;

    if(document?.status==="stored"&&document.file_path){
      const {data:file,error:downloadError}=await supabase.storage
        .from(document.storage_bucket||"finos-documents")
        .download(document.file_path);
      if(!downloadError&&file){
        return pdfResponse(new Uint8Array(await file.arrayBuffer()),document.file_name||`INV_${portalInvoice.invoice_number}.pdf`);
      }
    }

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

  const templateKey=getDocumentTemplate(organization.invoice_template_key,"invoice")?.key||"clean";
  const bytes=await renderInvoicePdf({
    invoice,
    organization,
    client,
    projectName,
    contents,
    templateKey,
  });

  const safeOrg=String(organization.name||organization.legal_name||"Invoice").replace(/[^a-z0-9]+/gi,"-");
  const fileName=`INV_${invoice.invoice_number}-${safeOrg}.pdf`;

  if(versionNumber&&issued){
    if(!document?.id){
      const {data:created}=await supabase.from("documents").insert({
        invoice_id:id,
        client_id:liveMeta?.client_id||null,
        organization_id:liveMeta?.organization_id||null,
        document_type:"invoice_pdf",
        file_path:"",
        file_name:fileName,
        visible_to_client:false,
        description:"Canonical issued invoice",
        mime_type:"application/pdf",
        status:"pending",
        version_number:versionNumber,
        template_key:templateKey,
        source_hash:issued.snapshot_hash,
        issued_at:liveMeta?.issued_at||new Date().toISOString(),
      }).select("id,status,file_path,file_name,storage_bucket").maybeSingle();
      document=created;
    }

    if(document?.id&&liveMeta?.organization_id){
      const filePath=`organizations/${liveMeta.organization_id}/invoices/${id}/v${versionNumber}.pdf`;
      let storedBytes=bytes;
      let storageError:string|null=null;
      const upload=await supabase.storage.from("finos-documents").upload(filePath,bytes,{contentType:"application/pdf",upsert:false});
      if(upload.error){
        const {data:file,error:existingError}=await supabase.storage.from("finos-documents").download(filePath);
        if(!existingError&&file)storedBytes=new Uint8Array(await file.arrayBuffer());
        else storageError=upload.error.message;
      }

      const checksum=createHash("sha256").update(storedBytes).digest("hex");
      const generatedAt=new Date().toISOString();
      const stored=!storageError;

      await supabase.from("documents").update({
        status:stored?"stored":"generated",
        file_path:stored?filePath:"",
        file_name:fileName,
        storage_bucket:"finos-documents",
        generated_at:generatedAt,
        checksum_sha256:checksum,
        source_hash:issued.snapshot_hash,
        template_key:templateKey,
        size_bytes:storedBytes.length,
      }).eq("id",document.id);

      await supabase.from("document_versions").upsert({
        document_id:document.id,
        version_number:versionNumber,
        file_path:stored?filePath:null,
        file_name:fileName,
        storage_bucket:"finos-documents",
        mime_type:"application/pdf",
        size_bytes:storedBytes.length,
        checksum_sha256:checksum,
        generated_at:generatedAt,
        generated_by:null,
        metadata:{source_hash:issued.snapshot_hash,template_key:templateKey,storage_error:storageError,source:"client_portal"},
      },{onConflict:"document_id,version_number"});

      if(stored)return pdfResponse(storedBytes,fileName);
    }
  }

  return pdfResponse(bytes,fileName);
}
