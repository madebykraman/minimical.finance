import {NextResponse} from "next/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createHash} from "node:crypto";
import {workspaceUser,sameOrigin} from "@/lib/ledger/server";
import {readCsv,readXlsx,normalizeUpload} from "@/lib/ledger/importer";

export const runtime="nodejs";
export async function POST(request:Request){
 if(!sameOrigin(request))return NextResponse.json({error:"Origin mismatch."},{status:403});
 const member=await workspaceUser();
 if(!member)return NextResponse.json({error:"Sign in as a workspace member."},{status:401});
 try{
  const db=member.db as unknown as SupabaseClient;
  const form=await request.formData(),file=form.get("file");
  const orgId=String(form.get("organization_id")??"");
  if(!/^[0-9a-f-]{36}$/i.test(orgId)||!(file instanceof File))
   return NextResponse.json({error:"Select an organisation and spreadsheet."},{status:400});
  if(file.size<1||file.size>12*1024*1024)
   return NextResponse.json({error:"Upload a spreadsheet smaller than 12 MB."},{status:413});
  const {data:org,error:orgError}=await db.from("tracker_organizations")
   .select("id,name").eq("id",orgId).maybeSingle();
  if(orgError||!org)return NextResponse.json({error:"Organisation not found or access denied."},{status:403});
  const extension=file.name.toLowerCase().split(".").pop();
  if(!["xlsx","csv","tsv"].includes(extension??""))
   return NextResponse.json({error:"Use an .xlsx, .csv or .tsv file."},{status:415});
  const bytes=Buffer.from(await file.arrayBuffer());
  if(extension==="xlsx"&&(bytes[0]!==0x50||bytes[1]!==0x4b))
   return NextResponse.json({error:"This is not a valid XLSX workbook."},{status:415});
  const sheets=extension==="xlsx"?readXlsx(bytes):readCsv(bytes.toString("utf8"));
  const parsed=normalizeUpload(sheets,org.name);
  const hash=createHash("sha256").update(bytes).digest("hex");
  const {data,error}=await db.rpc("tracker_apply_import",{
   p_organization_id:orgId,p_file_hash:hash,p_file_label:file.name.slice(0,180),
   p_records:parsed.records
  });
  if(error)throw error;
  return NextResponse.json({ok:true,...(data as object),organisation:org.name,
   detectedSheets:parsed.detectedSheets,warnings:parsed.warnings},
   {headers:{"Cache-Control":"private, no-store"}});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:"The spreadsheet could not be imported."},
   {status:422,headers:{"Cache-Control":"no-store"}});
 }
}
