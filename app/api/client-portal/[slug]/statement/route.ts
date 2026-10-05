import { NextRequest,NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";
import { renderStatementPdf } from "@/lib/finance/statement-pdf";

function bounds(period:string){
  const now=new Date();const end=new Date(now.getFullYear(),now.getMonth()+1,0);
  if(period==="month")return [new Date(now.getFullYear(),now.getMonth(),1),end];
  if(period==="3months")return [new Date(now.getFullYear(),now.getMonth()-2,1),end];
  if(period==="6months")return [new Date(now.getFullYear(),now.getMonth()-5,1),end];
  if(period==="fy"){const y=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;return [new Date(y,3,1),new Date(y+1,2,31)]}
  return [new Date(2000,0,1),new Date(2100,11,31)];
}
const iso=(d:Date)=>d.toISOString().slice(0,10);
const label=(p:string,s:Date)=>p==="month"?"This month":p==="3months"?"Last 3 months":p==="6months"?"Last 6 months":p==="fy"?`FY ${s.getFullYear()}-${String(s.getFullYear()+1).slice(-2)}`:"All time";

export async function GET(request:NextRequest,context:{params:Promise<{slug:string}>}){
  const {slug}=await context.params;const session=request.cookies.get("portal_session")?.value||"";const period=request.nextUrl.searchParams.get("period")||"all";
  if(!session)return new NextResponse("Unauthorized",{status:401});
  const supabase=createServiceClient();
  const [{data,error},{data:orgData}]=await Promise.all([
    supabase.rpc("get_client_portal",{p_slug:slug,p_session:hashPortalSession(session)}),
    supabase.rpc("get_client_portal_organization",{p_slug:slug,p_session:hashPortalSession(session)})
  ]);
  if(error||!data)return new NextResponse("Portal unavailable",{status:401});
  await supabase.rpc("log_client_portal_activity",{p_slug:slug,p_session:hashPortalSession(session),p_action:"statement_downloaded",p_resource_type:"statement"});
  const payload:any=data;const org:any=orgData||{};const [start,end]=bounds(period);const client:any=payload.client||{};
  const {data:rows,error:ledgerError}=await supabase.rpc("statement_ledger",{p_client_id:client.id,p_start:"2000-01-01",p_end:iso(end)});
  if(ledgerError)return new NextResponse("Statement unavailable",{status:500});
  const all=(rows||[]).map((r:any)=>({transaction_date:String(r.transaction_date),transaction_type:String(r.transaction_type),reference:String(r.reference||""),debit:Number(r.debit||0),credit:Number(r.credit||0),running_balance:Number(r.running_balance||0)}));
  const openingRows=all.filter(r=>r.transaction_date<iso(start));const openingBalance=openingRows.length?openingRows[openingRows.length-1].running_balance:0;
  const current=all.filter(r=>r.transaction_date>=iso(start)&&r.transaction_date<=iso(end));let running=openingBalance;
  const ledger=current.map(r=>{running+=r.debit-r.credit;return {...r,running_balance:running}});
  const periodText=label(period,start);
  const {data:clientMeta}=await supabase.from("clients").select("organization_id").eq("id",client.id).maybeSingle();
  const organizationId=clientMeta?.organization_id||null;
  const identity={
    organization:{name:org.name,legal_name:org.legal_name,email:org.email,phone:org.phone,address_lines:org.address_lines,pan:org.pan,gstin:org.gstin,logo_path:org.logo_path,invoice_footer_line_2:org.invoice_footer_line_2},
    client:{name:client.name,legal_name:client.legal_name,email:client.email,phone:client.phone,address_lines:client.address_lines,pan:client.pan,gstin:client.gstin,logo_path:client.logo_path},
  };
  const sourceHash=createHash("sha256").update(JSON.stringify({identity,period,periodText,start:iso(start),end:iso(end),openingBalance,ledger})).digest("hex");
  const filename=String(client.name||"Client").replace(/[^a-z0-9]+/gi,"-")+"-Account-Statement-"+period+".pdf";
  const {data:existing}=await supabase.from("documents").select("*").eq("client_id",client.id).eq("document_type","statement_pdf").maybeSingle();

  if(existing?.source_hash===sourceHash&&existing.file_path&&existing.status==="stored"){
    const {data:file,error:downloadError}=await supabase.storage.from(existing.storage_bucket||"finos-documents").download(existing.file_path);
    if(!downloadError&&file){
      const storedBytes=new Uint8Array(await file.arrayBuffer());
      return new NextResponse(storedBytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":"attachment; filename=\""+(existing.file_name||filename)+"\"","Cache-Control":"private, no-store"}});
    }
  }

  const bytes=await renderStatementPdf({organization:org,client,periodLabel:periodText,periodStart:iso(start),periodEnd:iso(end),rows:ledger,openingBalance});
  const checksum=createHash("sha256").update(bytes).digest("hex");
  const versionNumber=Number(existing?.version_number||0)+1;
  const filePath="organizations/"+organizationId+"/clients/"+client.id+"/statements/v"+versionNumber+".pdf";
  const generatedAt=new Date().toISOString();
  const upload=await supabase.storage.from("finos-documents").upload(filePath,bytes,{contentType:"application/pdf",upsert:false});
  if(upload.error)return new NextResponse("Statement generated but could not be stored",{status:500});

  let documentId=existing?.id as string|undefined;
  if(documentId){
    await supabase.from("documents").update({
      organization_id:organizationId,file_path:filePath,file_name:filename,status:"stored",version_number:versionNumber,
      generated_at:generatedAt,issued_at:generatedAt,size_bytes:bytes.length,checksum_sha256:checksum,
      source_hash:sourceHash,mime_type:"application/pdf",storage_bucket:"finos-documents",template_key:"statement-v1",
    }).eq("id",documentId);
  }else{
    const {data:created,error:createError}=await supabase.from("documents").insert({
      client_id:client.id,organization_id:organizationId,document_type:"statement_pdf",
      file_path:filePath,file_name:filename,status:"stored",version_number:versionNumber,visible_to_client:false,
      description:"Account statement",mime_type:"application/pdf",generated_at:generatedAt,issued_at:generatedAt,
      size_bytes:bytes.length,checksum_sha256:checksum,source_hash:sourceHash,storage_bucket:"finos-documents",template_key:"statement-v1",
    }).select("id").single();
    if(createError||!created)return new NextResponse("Statement stored but document registration failed",{status:500});
    documentId=created.id;
  }
  await supabase.from("document_versions").upsert({
    document_id:documentId!,version_number:versionNumber,file_path:filePath,file_name:filename,
    storage_bucket:"finos-documents",mime_type:"application/pdf",size_bytes:bytes.length,
    checksum_sha256:checksum,generated_at:generatedAt,generated_by:null,
    metadata:{source_hash:sourceHash,period,period_label:periodText,period_start:iso(start),period_end:iso(end),source:"client_portal"},
  },{onConflict:"document_id,version_number"});

  return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":"attachment; filename=\""+filename+"\"","Cache-Control":"private, no-store"}});
}
