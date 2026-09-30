import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";

export async function GET(request:NextRequest){
  const slug=request.nextUrl.searchParams.get("slug")||"";
  const session=request.cookies.get("finos_portal_session")?.value||"";
  if(!slug||!session)return NextResponse.json({error:"Authentication required."},{status:401});
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("get_client_portal",{p_slug:slug,p_session:hashPortalSession(session)});
  if(error||!data)return NextResponse.json({error:"Portal session expired or unavailable."},{status:401});
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}
