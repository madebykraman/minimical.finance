import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { renderStatementPdf } from "@/lib/finance/statement-pdf";

function bounds(period:string){
  const now=new Date();
  const end=new Date(now.getFullYear(),now.getMonth()+1,0);
  if(period==="month")return [new Date(now.getFullYear(),now.getMonth(),1),end];
  if(period==="3months")return [new Date(now.getFullYear(),now.getMonth()-2,1),end];
  if(period==="6months")return [new Date(now.getFullYear(),now.getMonth()-5,1),end];
  if(period==="fy"){
    const startYear=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;
    return [new Date(startYear,3,1),new Date(startYear+1,2,31)];
  }
  return [new Date(2000,0,1),new Date(2100,11,31)];
}
function iso(d:Date){return d.toISOString().slice(0,10)}
function periodLabel(period:string,start:Date,end:Date){
  if(period==="month")return "This month";
  if(period==="3months")return "Last 3 months";
  if(period==="6months")return "Last 6 months";
  if(period==="fy")return `FY ${start.getFullYear()}-${String(start.getFullYear()+1).slice(-2)}`;
  return "All time";
}

export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;
  const period=request.nextUrl.searchParams.get("period")||"all";
  const supabase=await createClient();
  const {data:user}=await supabase.auth.getUser();
  if(!user.user)return new NextResponse("Unauthorized",{status:401});

  const {data:client,error:clientError}=await supabase.from("clients").select("*,organizations(*)").eq("id",id).maybeSingle();
  if(clientError||!client)return new NextResponse("Client not found",{status:404});
  const org=(client as any).organizations||{};
  const [start,end]=bounds(period);
  const startIso=iso(start),endIso=iso(end);

  const {data:rows,error}=await supabase.rpc("statement_ledger",{p_client_id:id,p_start:"2000-01-01",p_end:endIso});
  if(error)return new NextResponse("Statement unavailable",{status:500});

  const allRows=(rows||[]).map((row:any)=>({
    transaction_date:String(row.transaction_date),
    transaction_type:String(row.transaction_type),
    reference:String(row.reference||""),
    debit:Number(row.debit||0),
    credit:Number(row.credit||0),
    running_balance:Number(row.running_balance||0),
  }));
  const openingRows=allRows.filter(row=>row.transaction_date<startIso);
  const openingBalance=openingRows.length?openingRows[openingRows.length-1].running_balance:0;
  const currentRows=allRows.filter(row=>row.transaction_date>=startIso&&row.transaction_date<=endIso);
  let running=openingBalance;
  const ledger=currentRows.map(row=>{
    running+=row.debit-row.credit;
    return {...row,running_balance:running};
  });

  const statementLabel=periodLabel(period,start,end);
  const filename=String((client as any).name||"Client").replace(/[^a-z0-9]+/gi,"-")+"-Account-Statement-"+period+".pdf";
  const identity={
    organization:{name:org.name,legal_name:org.legal_name,email:org.email,phone:org.phone,address_lines:org.address_lines,pan:org.pan,gstin:org.gstin,logo_path:org.logo_path,invoice_footer_line_2:org.invoice_footer_line_2},
    client:{name:(client as any).name,legal_name:(client as any).legal_name,email:(client as any).email,phone:(client as any).phone,address_lines:(client as any).address_lines,pan:(client as any).pan,gstin:(client as any).gstin,logo_path:(client as any).logo_path},
  };
  const sourceHash=createHash("sha256").update(JSON.stringify({identity,period,statementLabel,startIso,endIso,openingBalance,ledger})).digest("hex");
  const {data:existing}=await supabase.from("documents").select("*").eq("client_id",id).eq("document_type","statement_pdf").maybeSingle();

  if(existing?.source_hash===sourceHash&&existing.file_path&&existing.status==="stored"){
    const {data:file,error:downloadError}=await supabase.storage.from(existing.storage_bucket||"finos-documents").download(existing.file_path);
    if(!downloadError&&file){
      const storedBytes=new Uint8Array(await file.arrayBuffer());
      return new NextResponse(storedBytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":"attachment; filename=\""+(existing.file_name||filename)+"\"","Cache-Control":"private, no-store"}});
    }
  }

  const bytes=await renderStatementPdf({
    organization:org,
    client:client as any,
    periodLabel:statementLabel,
    periodStart:startIso,
    periodEnd:endIso,
    rows:ledger,
    openingBalance,
  });
  const checksum=createHash("sha256").update(bytes).digest("hex");
  const versionNumber=Number(existing?.version_number||0)+1;
  const filePath="organizations/"+(client as any).organization_id+"/clients/"+id+"/statements/v"+versionNumber+".pdf";
  const generatedAt=new Date().toISOString();
  const upload=await supabase.storage.from("finos-documents").upload(filePath,bytes,{contentType:"application/pdf",upsert:false});
  if(upload.error)return new NextResponse("Statement generated but could not be stored: "+upload.error.message,{status:500});

  let documentId=existing?.id as string|undefined;
  if(documentId){
    const {error:updateError}=await supabase.from("documents").update({
      organization_id:(client as any).organization_id,
      file_path:filePath,file_name:filename,status:"stored",version_number:versionNumber,
      generated_at:generatedAt,issued_at:generatedAt,size_bytes:bytes.length,
      checksum_sha256:checksum,source_hash:sourceHash,mime_type:"application/pdf",
      storage_bucket:"finos-documents",template_key:"statement-v1",
    }).eq("id",documentId);
    if(updateError)return new NextResponse("Statement stored but register update failed: "+updateError.message,{status:500});
  }else{
    const {data:created,error:createError}=await supabase.from("documents").insert({
      client_id:id,organization_id:(client as any).organization_id,document_type:"statement_pdf",
      file_path:filePath,file_name:filename,status:"stored",version_number:versionNumber,
      visible_to_client:false,description:"Account statement",mime_type:"application/pdf",
      generated_at:generatedAt,issued_at:generatedAt,size_bytes:bytes.length,
      checksum_sha256:checksum,source_hash:sourceHash,storage_bucket:"finos-documents",template_key:"statement-v1",
    }).select("id").single();
    if(createError||!created)return new NextResponse("Statement stored but document registration failed",{status:500});
    documentId=created.id;
  }
  await supabase.from("document_versions").upsert({
    document_id:documentId!,version_number:versionNumber,file_path:filePath,file_name:filename,
    storage_bucket:"finos-documents",mime_type:"application/pdf",size_bytes:bytes.length,
    checksum_sha256:checksum,generated_at:generatedAt,generated_by:user.user.id,
    metadata:{source_hash:sourceHash,period,period_label:statementLabel,period_start:startIso,period_end:endIso},
  },{onConflict:"document_id,version_number"});

  return new NextResponse(bytes,{headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":"attachment; filename=\""+filename+"\"",
    "Cache-Control":"private, no-store",
  }});
}
