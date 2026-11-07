import "server-only";
import {createHash,randomBytes,scryptSync,timingSafeEqual} from "node:crypto";
import {serviceClient} from "./server";
import {cookies} from "next/headers";
export const PORTAL_COOKIE="finance_portal_session";
export function passwordHash(password:string){
  const salt=randomBytes(16).toString("hex");
  const hash=scryptSync(password,salt,64).toString("hex");
  return salt+":"+hash;
}
export function verifyPassword(password:string,stored:string){
  const [salt,hash]=String(stored).split(":");
  if(!salt||!hash||!/^[0-9a-f]+$/i.test(hash))return false;
  const actual=scryptSync(password,salt,64),expected=Buffer.from(hash,"hex");
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export const tokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
export async function portalSession(){
  const cookie=(await cookies()).get(PORTAL_COOKIE)?.value;
  if(!cookie||cookie.length>256)return false;
  const db=serviceClient();
  const {data:access,error:accessError}=await db.from("tracker_portal_access").select("enabled").eq("id",true).maybeSingle();
  if(accessError||!access?.enabled)return false;
  const {data:session,error}=await db.from("tracker_portal_sessions")
    .select("id").eq("token_hash",tokenHash(cookie)).gt("expires_at",new Date().toISOString()).maybeSingle();
  return !error&&!!session;
}
