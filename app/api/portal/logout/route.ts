import {NextResponse} from "next/server";
import {PORTAL_COOKIE,tokenHash} from "@/lib/ledger/portal";
import {serviceClient,sameOrigin} from "@/lib/ledger/server";
import {cookies} from "next/headers";
export async function POST(request:Request){
 if(!sameOrigin(request))return NextResponse.json({error:"Origin mismatch"},{status:403});
 const token=(await cookies()).get(PORTAL_COOKIE)?.value;
 if(token)try{await serviceClient().from("tracker_portal_sessions").delete().eq("token_hash",tokenHash(token));}catch{}
 const res=NextResponse.json({ok:true});
 res.cookies.set(PORTAL_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});
 res.headers.set("Cache-Control","no-store");
 return res;
}
