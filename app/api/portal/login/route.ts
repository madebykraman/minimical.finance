import {NextResponse} from "next/server";
import {randomBytes} from "node:crypto";
import {serviceClient,sameOrigin} from "@/lib/ledger/server";
import {PORTAL_COOKIE,verifyPassword,tokenHash} from "@/lib/ledger/portal";
export async function POST(request:Request){
 if(!sameOrigin(request))return NextResponse.json({error:"Origin mismatch"},{status:403});
 const body=await request.json().catch(()=>({}));
 const password=String(body.password??"");
 if(password.length<1||password.length>256)return NextResponse.json({error:"Invalid password."},{status:400});
 try{
   const db=serviceClient();
   const {data:access}=await db.from("tracker_portal_access").select("enabled,password_hash,locked_until").eq("id",true).maybeSingle();
   if(!access?.enabled||!access.password_hash)return NextResponse.json({error:"Client portal is unavailable."},{status:403});
   if(access.locked_until&&new Date(access.locked_until).getTime()>Date.now())return NextResponse.json({error:"Too many attempts. Try again later."},{status:429});
   const match=verifyPassword(password,access.password_hash);
   const {data:ok,error:attemptError}=await db.rpc("tracker_portal_login_attempt",{p_correct:match});
   if(attemptError)throw attemptError;
   if(ok!==true)return NextResponse.json({error:"Incorrect password."},{status:401});
   const token=randomBytes(32).toString("base64url");
   const expires=new Date(Date.now()+24*60*60*1000).toISOString();
   const {error:saveError}=await db.from("tracker_portal_sessions").insert({token_hash:tokenHash(token),expires_at:expires});
   if(saveError)throw saveError;
   const res=NextResponse.json({ok:true});
   res.cookies.set(PORTAL_COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:24*60*60});
   res.headers.set("Cache-Control","no-store");
   return res;
 }catch{return NextResponse.json({error:"Client access temporarily unavailable."},{status:503})}
}
