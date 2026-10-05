import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getDocumentTemplate } from "@/lib/finance/document-templates";
import { renderInvoicePdf } from "@/lib/finance/invoice-pdf";

function pdfResponse(bytes:Uint8Array,fileName:string){
  return new NextResponse(bytes,{headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":`attachment; filename="${fileName.replace(/["\\]/g,"-")}"`,
    "Cache-Control":"private, no-store",
  }});
}

export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;
  const requestedRaw=request.nextUrl.searchParams.get("version");
  const requestedVersion=requestedRaw?Number(requestedRaw):null;
  if(requestedRaw&&(!Number.isInteger(requestedVersion)||Number(requestedVersion)<=0)){
    return new NextResponse("Invalid invoice version",{status:400});
  }

  const supabase=await createClient();
  const {data:userData}=await supabase.auth.getUser();
  if(!userData.user)return new NextResponse("Unauthorized",{status:401});

  const [{data:rawInvoice,error},{data:settings}]=await Promise.all([
    supabase.from("invoices").select("*,clients(*),projects(name),invoice_contents(*),payments(*),organizations(*)").eq("id",id).maybeSingle(),
    supabase.from("workspace_settings").select("*").eq("id",true).maybeSingle(),
  ]);
  if(error||!rawInvoice)return new NextResponse("Invoice not found",{status:404});

  const live:any=rawInvoice;
  const targetVersionNumber=requestedVersion??(live.issued_version?Number(live.issued_version):null);
  const {data:issuedVersion}=targetVersionNumber
    ? await supabase.from("invoice_versions").select("version_number,snapshot,snapshot_hash").eq("invoice_id",id).eq("version_number",targetVersionNumber).maybeSingle()
    : {data:null};

  if(requestedVersion&&!issuedVersion)return new NextResponse("Invoice version not found",{status:404});

  let document:any=null;
  if(issuedVersion){
    const {data:existing}=await supabase.from("documents")
      .select("id,status,file_path,file_name,storage_bucket")
      .eq("invoice_id",id)
      .eq("document_type","invoice_pdf")
      .eq("version_number",Number(issuedVersion.version_number))
      .maybeSingle();
    document=existing;

    if(document?.status==="stored"&&document.file_path){
      const {data:file,error:downloadError}=await supabase.storage
        .from(document.storage_bucket||"finos-documents")
        .download(document.file_path);
      if(!downloadError&&file){
        return pdfResponse(new Uint8Array(await file.arrayBuffer()),document.file_name||`INV_${live.invoice_number}.pdf`);
      }
    }
  }

  const snapshot:any=issuedVersion?.snapshot;
  const invoice:any=snapshot?.invoice?{...live,...snapshot.invoice}:live;
  const client:any=snapshot?.client??live.clients??{};
  const organization:any=snapshot?.organization??live.organizations??settings??{};
  const project:any=snapshot?.project??live.projects??null;
  const contents:any[]=[...(snapshot?.contents??live.invoice_contents??[])].sort((a:any,b:any)=>Number(a.position??0)-Number(b.position??0));
  const templateKey=getDocumentTemplate(organization.invoice_template_key,"invoice")?.key||"clean";

  const bytes=await renderInvoicePdf({
    invoice,
    organization,
    client,
    projectName:project?.name??live.projects?.name??"",
    contents,
    templateKey,
  });

  const safeOrg=String(organization.name||organization.legal_name||"Invoice").replace(/[^a-z0-9]+/gi,"-");
  const fileName=`INV_${invoice.invoice_number}-${safeOrg}.pdf`;

  if(issuedVersion){
    const versionNumber=Number(issuedVersion.version_number);
    if(!document?.id){
      const {data:created,error:createError}=await supabase.from("documents").insert({
        invoice_id:id,
        client_id:live.client_id,
        organization_id:live.organization_id,
        document_type:"invoice_pdf",
        file_path:"",
        file_name:fileName,
        visible_to_client:false,
        description:"Canonical issued invoice",
        mime_type:"application/pdf",
        status:"pending",
        version_number:versionNumber,
        template_key:templateKey,
        source_hash:issuedVersion.snapshot_hash,
        issued_at:live.issued_at||new Date().toISOString(),
      }).select("id,status,file_path,file_name,storage_bucket").single();
      if(!createError)document=created;
      else{
        const {data:retry}=await supabase.from("documents")
          .select("id,status,file_path,file_name,storage_bucket")
          .eq("invoice_id",id)
          .eq("document_type","invoice_pdf")
          .eq("version_number",versionNumber)
          .maybeSingle();
        document=retry;
      }
    }

    if(document?.id){
      const checksum=createHash("sha256").update(bytes).digest("hex");
      const filePath=`organizations/${live.organization_id}/invoices/${id}/v${versionNumber}.pdf`;
      let storedBytes=bytes;
      let storageError:string|null=null;
      const upload=await supabase.storage.from("finos-documents").upload(filePath,bytes,{contentType:"application/pdf",upsert:false});
      if(upload.error){
        const {data:file,error:existingError}=await supabase.storage.from("finos-documents").download(filePath);
        if(!existingError&&file)storedBytes=new Uint8Array(await file.arrayBuffer());
        else storageError=upload.error.message;
      }
      const stored=!storageError;
      const storedChecksum=createHash("sha256").update(storedBytes).digest("hex");
      const generatedAt=new Date().toISOString();

      await supabase.from("documents").update({
        status:stored?"stored":"generated",
        file_path:stored?filePath:"",
        file_name:fileName,
        storage_bucket:"finos-documents",
        generated_at:generatedAt,
        checksum_sha256:storedChecksum,
        source_hash:issuedVersion.snapshot_hash,
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
        checksum_sha256:storedChecksum,
        generated_at:generatedAt,
        generated_by:userData.user.id,
        metadata:{source_hash:issuedVersion.snapshot_hash,template_key:templateKey,storage_error:storageError},
      },{onConflict:"document_id,version_number"});

      if(stored)return pdfResponse(storedBytes,fileName);
    }
  }

  return pdfResponse(bytes,fileName);
}
