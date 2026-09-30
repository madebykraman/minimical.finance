import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";
export async function POST(request:Request){
  const response=NextResponse.json({ok:true});
  const cookie=request.headers.get("cookie")||"";
  const match=cookie.match(/(?:^|; )finos_portal_session=([^;]+)/);
  if(match){
    const supabase=await createClient();
    await supabase.from("client_portal_sessions").delete().eq("session_hash",hashPortalSession(decodeURIComponent(match[1])));
  }
  response.cookies.set("finos_portal_session","",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});
  return response;
}
