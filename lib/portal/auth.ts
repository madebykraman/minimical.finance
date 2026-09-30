import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

export function hashPortalPassword(password:string){
  const salt=randomBytes(16).toString("hex");
  const hash=scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString("hex");
  return `scrypt$16384$8$1$${salt}$${hash}`;
}
export function verifyPortalPassword(password:string,stored:string){
  const parts=stored.split("$");
  if(parts.length!==6||parts[0]!=="scrypt") return false;
  const [,n,r,p,salt,expected]=parts;
  try{
    const actual=scryptSync(password,salt,64,{N:Number(n),r:Number(r),p:Number(p)}).toString("hex");
    return timingSafeEqual(Buffer.from(actual,"hex"),Buffer.from(expected,"hex"));
  }catch{return false}
}
export function hashPortalSession(token:string){return createHash("sha256").update(token).digest("hex");}
