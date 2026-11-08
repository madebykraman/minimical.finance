import {NextResponse} from "next/server";
import {workspaceUser,serviceClient,sameOrigin} from "@/lib/ledger/server";
import {portalSession} from "@/lib/ledger/portal";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params;const admin=await workspaceUser(),portal=admin?false:await portalSession();
  if(!admin&&!portal)return NextResponse.json({error:"Unauthorised"},{status:401});
  const db=admin?(admin.db as unknown as ReturnType<typeof serviceClient>):serviceClient();const {data,error}=await db.from("tracker_documents").select("storage_path,visible_to_client,client_id").eq("id",id).maybeSingle();
  if(error||!data)return NextResponse.json({error:"Not found"},{status:404});
  if(!admin){
    const {data:org}=await db.from("tracker_organizations").select("id").eq("name","Kumar Aman").maybeSingle();
    const {data:sourceClient}=await db.from("tracker_clients").select("id").eq("name","Elle India").eq("organization_id",org?.id??"00000000-0000-0000-0000-000000000000").maybeSingle();
    if(!data.visible_to_client||!sourceClient||data.client_id!==sourceClient.id)return NextResponse.json({error:"Not authorised"},{status:403});
  }
  const {data:link,error:linkError}=await db.storage.from("finos-documents").createSignedUrl(data.storage_path,60);
  if(linkError||!link?.signedUrl)throw new Error("Document unavailable.");
  return NextResponse.redirect(link.signedUrl,{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Could not open document."},{status:503})}
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return NextResponse.json({error:"Origin mismatch"},{status:403});
 const member=await workspaceUser();if(!member)return NextResponse.json({error:"Unauthorised"},{status:401});
 try{
  const {id}=await params;const db=member.db as unknown as ReturnType<typeof serviceClient>;const {data,error}=await db.from("tracker_documents").select("storage_path").eq("id",id).maybeSingle();
  if(error)throw error;if(!data)return NextResponse.json({error:"Not found"},{status:404});
  const {error:removeError}=await db.storage.from("finos-documents").remove([data.storage_path]);
  if(removeError)throw removeError;
  const {error:deleteError}=await db.from("tracker_documents").delete().eq("id",id);
  if(deleteError)throw deleteError;
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:"Could not remove document."},{status:503})}
}
