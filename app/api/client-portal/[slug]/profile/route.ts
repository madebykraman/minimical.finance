import { NextRequest,NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";

export async function POST(request:NextRequest,{params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;const session=request.cookies.get("portal_session")?.value||"";
 if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const payload=await request.json();const supabase=createServiceClient();
 const {data,error}=await supabase.rpc("update_client_portal_profile",{p_slug:slug,p_session:hashPortalSession(session),p_payload:payload});
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json(data,{headers:{"Cache-Control":"private,no-store"}});
}