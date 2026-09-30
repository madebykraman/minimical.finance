import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";

export async function GET(request:NextRequest,{params}:{params:Promise<{slug:string;id:string}>}){
 const {slug,id}=await params;
 const session=request.cookies.get("finos_portal_session")?.value||"";
 if(!slug||!id||!session)return new NextResponse("Unauthorized",{status:401});
 const supabase=await createClient();
 const {data,error}=await supabase.rpc("get_client_portal",{p_slug:slug,p_session:hashPortalSession(session)}); const payload:any=data;
 if(error||!data)return new NextResponse("Unauthorized",{status:401});
 await supabase.rpc("log_client_portal_activity",{p_slug:slug,p_session:hashPortalSession(session),p_action:"document_downloaded",p_resource_type:"document",p_resource_id:id});
 const doc=(payload?.documents||[]).find((d:any)=>d.id===id);
 if(!doc?.file_path)return new NextResponse("Document not found",{status:404});
 const upstream=await fetch(doc.file_path,{cache:"no-store"});
 if(!upstream.ok)return new NextResponse("Document unavailable",{status:502});
 const bytes=await upstream.arrayBuffer();
 return new NextResponse(bytes,{headers:{"Content-Type":doc.mime_type||"application/octet-stream","Content-Disposition":`attachment; filename="${String(doc.file_name).replace(/["\\]/g,"-")}"`,"Cache-Control":"private, no-store"}});
}