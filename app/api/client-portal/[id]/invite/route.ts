import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const supabase=await createClient();
  const {data:user}=await supabase.auth.getUser();
  if(!user.user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {data:client,error}=await supabase.from("clients").select("id,name,email,portal_enabled,portal_slug,portal_password_hash").eq("id",id).maybeSingle();
  if(error||!client)return NextResponse.json({error:"Client not found"},{status:404});
  if(!client.email)return NextResponse.json({error:"Add a client email before preparing the invitation."},{status:400});
  if(!client.portal_enabled||!client.portal_password_hash)return NextResponse.json({error:"Enable the portal and set a password before inviting the client."},{status:400});
  const token=randomBytes(32).toString("base64url");
  const tokenHash=createHash("sha256").update(token).digest("hex");
  await supabase.from("client_portal_tokens").update({revoked_at:new Date().toISOString()}).eq("client_id",id).is("revoked_at",null);
  const {error:tokenError}=await supabase.from("client_portal_tokens").insert({client_id:id,token_hash:tokenHash,label:"Email invitation"});
  if(tokenError)return NextResponse.json({error:tokenError.message},{status:400});
  const url=request.nextUrl.origin+"/portal/"+client.portal_slug+"?token="+encodeURIComponent(token);
  const subject="Your secure client account";
  const body=[`Hello ${client.name},`,"","Your secure client account is ready. Open the link below and enter the portal password shared with you separately.","",url,"","For security, please do not forward the password with this email."].join("\n");
  await supabase.rpc("log_client_portal_activity",{p_slug:client.portal_slug,p_session:null,p_action:"invitation_prepared",p_resource_type:"account",p_metadata:{delivery:"mailto",email:client.email}});
  return NextResponse.json({email:client.email,url,subject,body,mailto:"mailto:"+encodeURIComponent(client.email)+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body)});
}
