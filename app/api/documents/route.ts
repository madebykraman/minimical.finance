import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {workspaceUser,serviceClient,sameOrigin} from "@/lib/ledger/server";
export async function POST(request:Request){
 if(!sameOrigin(request))return NextResponse.json({error:"Origin mismatch"},{status:403});
 if(!await workspaceUser())return NextResponse.json({error:"Not authorised"},{status:401});
 try{
  const form=await request.formData();const file=form.get("file");
  if(!(file instanceof File)||file.size===0||file.size>15*1024*1024)return NextResponse.json({error:"Choose a file up to 15 MB."},{status:400});
  const bytes=Buffer.from(await file.arrayBuffer());
  const pdf=bytes.subarray(0,5).toString("ascii")==="%PDF-";
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=bytes.subarray(0,4).toString("ascii")==="RIFF"&&bytes.subarray(8,12).toString("ascii")==="WEBP";
  const mime=pdf?"application/pdf":png?"image/png":jpg?"image/jpeg":webp?"image/webp":null;
  if(!mime)return NextResponse.json({error:"Only real PDF, PNG, JPEG, or WebP files are supported."},{status:415});
  const name=file.name.replace(/[\r\n\/\\<>:"|?*]/g,"_").slice(0,145)||"document";
  const path="tracker/"+randomUUID()+"/"+name;
  const invoice=String(form.get("invoice_number")||"").trim()||null;
  const client=String(form.get("client_id")||"").trim()||null;
  const visible=form.get("visible_to_client")==="true";
  const db=serviceClient();
  const {error:storageError}=await db.storage.from("finos-documents").upload(path,bytes,{contentType:mime,upsert:false});
  if(storageError)throw storageError;
  const {error:recordError}=await db.from("tracker_documents").insert({file_name:name,storage_path:path,mime_type:mime,size_bytes:file.size,invoice_number:invoice,client_id:client,visible_to_client:visible});
  if(recordError){
    await db.storage.from("finos-documents").remove([path]);throw recordError;
  }
  return NextResponse.json({ok:true},{status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Upload failed."},{status:500})}
}
