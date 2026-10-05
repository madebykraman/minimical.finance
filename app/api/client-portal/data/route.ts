import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";

export async function GET(request:NextRequest){
  const slug=request.nextUrl.searchParams.get("slug")||"";
  const session=request.cookies.get("portal_session")?.value||"";
  if(!slug||!session)return NextResponse.json({error:"Authentication required."},{status:401});

  const supabase=createServiceClient();
  const sessionHash=hashPortalSession(session);
  const [{data,error},{data:organization,error:organizationError}]=await Promise.all([
    supabase.rpc("get_client_portal",{p_slug:slug,p_session:sessionHash}),
    supabase.rpc("get_client_portal_organization",{p_slug:slug,p_session:sessionHash}),
  ]);
  if(error||!data)return NextResponse.json({error:"Portal session expired or unavailable."},{status:401});
  if(organizationError)return NextResponse.json({error:"Organisation identity is unavailable."},{status:500});

  await supabase.rpc("log_client_portal_activity",{
    p_slug:slug,
    p_session:sessionHash,
    p_action:"account_viewed",
    p_resource_type:"account",
  });

  const payload=(typeof data==="object"&&data!==null&&!Array.isArray(data)?data:{}) as Record<string,unknown>;
  return NextResponse.json({...payload,organization:organization||{}},{headers:{"Cache-Control":"private, no-store"}});
}
