import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashPortalPassword } from "@/lib/portal/auth";

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;
  const body=await request.json().catch(()=>({}));
  const password=String(body.password||"");
  if(password.length<10) return NextResponse.json({error:"Use at least 10 characters for a client portal password."},{status:400});
  const supabase=await createClient();
  const {data:user}=await supabase.auth.getUser();
  if(!user.user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {data:member}=await supabase.from("workspace_members").select("user_id").eq("user_id",user.user.id).maybeSingle();
  if(!member) return NextResponse.json({error:"Unauthorized"},{status:403});
  const {data:rotated,error}=await supabase.rpc("rotate_client_portal_password",{
    p_client_id:id,
    p_password_hash:hashPortalPassword(password),
  });
  if(error||rotated!==true)return NextResponse.json({error:error?.message||"Could not rotate portal access."},{status:400});
  return NextResponse.json({ok:true,sessions_revoked:true,tokens_revoked:true});
}
