import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";

export async function GET(request:NextRequest){
  const slug=request.nextUrl.searchParams.get("slug")||"";
  const session=request.cookies.get("portal_session")?.value||"";
  if(!slug||!session)return NextResponse.json({error:"Authentication required."},{status:401});
  const supabase=createServiceClient();
  const {data,error}=await supabase.rpc("get_client_portal",{p_slug:slug,p_session:hashPortalSession(session)});
  if(error||!data)return NextResponse.json({error:"Portal session expired or unavailable."},{status:401});
  const log=await supabase.rpc("log_client_portal_activity",{p_slug:slug,p_session:hashPortalSession(session),p_action:"account_viewed",p_resource_type:"account"});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}
