import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {workspaceUser,serviceClient,sameOrigin} from "@/lib/ledger/server";
export const runtime="nodejs";
export async function POST(request:Request){
 if(!sameOrigin(request))return NextResponse.json({error:"Origin mismatch"},{status:403});
 if(!await workspaceUser())return NextResponse.json({error:"Not authorised"},{status:401});
 try{
  const form=await request.formData(),file=form.get("file");
  const orgId=String(form.get("organization_id")||"");
  if(!/^[0-9a-f-]{36}$/i.test(orgId)||!(file instanceof File))
   return NextResponse.json({error:"Organisation and file are required."},{status:400});
  if(file.size===0||file.size>15*1024*1024)return NextResponse.json({error:"Choose a file under 15 MB."},{status:400});
  const db=serviceClient();
  const {data:org,error:orgError}=await db.from("tracker_organizations").select("id,name").eq("id",orgId).maybeSingle();
  if(orgError||!org)return NextResponse.json({error:"Organisation not found."},{status:404});
  const invoice=String(form.get("invoice_number")||"").trim()||null;
  const client=String(form.get("client_id")||"").trim()||null;
  if(client){
   const {data}=await db.from("tracker_clients").select("id").eq("organization_id",orgId).eq("id",client).maybeSingle();
   if(!data)return NextResponse.json({error:"Client does not belong to this organisation."},{status:422});
  }
  if(invoice){
   const {data}=await db.from("tracker_rows").select("id").eq("organization_id",orgId).eq("invoice_number",invoice).limit(1);
   if(!data?.length)return NextResponse.json({error:"Invoice does not belong to this organisation."},{status:422});
  }
  const visible=form.get("visible_to_client")==="true";
  if(visible&&(!client||org.name!=="Kumar Aman"))return NextResponse.json({error:"Client sharing requires a supported, selected client."},{status:422});
  const bytes=Buffer.from(await file.arrayBuffer());
  const isPdf=bytes.subarray(0,5).toString("ascii")==="%PDF-";
  const isPng=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isJpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const isWebp=bytes.subarray(0,4).toString("ascii")==="RIFF"&&bytes.subarray(8,12).toString("ascii")==="WEBP";
  const mime=isPdf?"application/pdf":isPng?"image/png":isJpeg?"image/jpeg":isWebp?"image/webp":null;
  if(!mime)return NextResponse.json({error:"Only PDF, PNG, JPEG and WebP files are supported."},{status:415});
  const name=file.name.replace(/[\r\n\/\\<>:"|?*]/g,"_").slice(0,145)||"document";
  const storagePath="finance/"+orgId+"/"+randomUUID()+"/"+name;
  const {error:uploadError}=await db.storage.from("finos-documents").upload(storagePath,bytes,{contentType:mime,upsert:false});
  if(uploadError)throw uploadError;
  const {error:recordError}=await db.from("tracker_documents").insert({
    organization_id:orgId,file_name:name,storage_path:storagePath,mime_type:mime,size_bytes:file.size,
    invoice_number:invoice,client_id:client,visible_to_client:visible
  });
  if(recordError){
   await db.storage.from("finos-documents").remove([storagePath]);
   throw recordError;
  }
  return NextResponse.json({ok:true},{status:201,headers:{"Cache-Control":"no-store"}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Upload failed."},{status:500})}
}
