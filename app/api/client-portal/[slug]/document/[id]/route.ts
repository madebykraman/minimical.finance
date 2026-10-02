import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";

export async function GET(request:NextRequest,{params}:{params:Promise<{slug:string;id:string}>}){
 const {slug,id}=await params;
 const session=request.cookies.get("portal_session")?.value||"";
 if(!slug||!id||!session)return new NextResponse("Unauthorized",{status:401});
 const supabase=createServiceClient();
 const {data,error}=await supabase.rpc("get_client_portal",{p_slug:slug,p_session:hashPortalSession(session)}); const payload:any=data;
 if(error||!data)return new NextResponse("Unauthorized",{status:401});
 await supabase.rpc("log_client_portal_activity",{p_slug:slug,p_session:hashPortalSession(session),p_action:"document_downloaded",p_resource_type:"document",p_resource_id:id});
 const doc=(payload?.documents||[]).find((d:any)=>d.id===id);
 if(!doc?.file_path)return new NextResponse("Document not found",{status:404});
 const service=createServiceClient();
 const {data:signed,error:signedError}=await service.storage.from(doc.storage_bucket||"finos-documents").createSignedUrl(doc.file_path,60);
 if(signedError||!signed?.signedUrl)return new NextResponse("Document unavailable",{status:502});
 const upstream=await fetch(signed.signedUrl,{cache:"no-store"});
 if(!upstream.ok)return new NextResponse("Document unavailable",{status:502});
 const bytes=await upstream.arrayBuffer(); const preview=new URL(request.url).searchParams.get("preview")==="1";
 return new NextResponse(bytes,{headers:{"Content-Type":doc.mime_type||"application/octet-stream","Content-Disposition":`${preview?"inline":"attachment"}; filename="${String(doc.file_name).replace(/["\\]/g,"-")}"`,"Cache-Control":"private, no-store"}});
}