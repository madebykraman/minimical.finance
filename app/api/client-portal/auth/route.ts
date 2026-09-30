import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { hashPortalPassword, verifyPortalPassword, hashPortalSession } from "@/lib/portal/auth";

export async function POST(request:NextRequest){
  const body=await request.json().catch(()=>({}));
  const slug=String(body.slug||""); const token=String(body.token||""); const password=String(body.password||"");
  if(!slug||!token||!password) return NextResponse.json({error:"Portal, access link and password are required."},{status:400});
  const supabase=await createClient();
  const {data:secret,error}=await supabase.rpc("get_client_portal_secret",{p_slug:slug,p_token:token});
  const secretAny:any=secret;
  if(error||!secretAny?.client_id||!secretAny?.password_hash) return NextResponse.json({error:"This portal link is invalid, disabled, or has no password configured."},{status:401});
  if(!verifyPortalPassword(password,secretAny.password_hash)) return NextResponse.json({error:"Incorrect portal password."},{status:401});
  const sessionToken=randomBytes(32).toString("base64url");
  const expires=new Date(Date.now()+7*24*60*60*1000).toISOString();
  const {data:created,error:createError}=await supabase.rpc("create_client_portal_session",{p_slug:slug,p_token:token,p_session_hash:hashPortalSession(sessionToken),p_expires_at:expires});
  if(createError||created!==true) return NextResponse.json({error:"Could not create a portal session."},{status:500});
  const response=NextResponse.json({ok:true});
  response.cookies.set("finos_portal_session",sessionToken,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:7*24*60*60});
  return response;
}

export async function DELETE(){
  const response=NextResponse.json({ok:true});
  response.cookies.set("finos_portal_session","",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});
  return response;
}

export { hashPortalPassword };
