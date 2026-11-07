import "server-only";
import {createClient as createServiceClientBase} from "@supabase/supabase-js";
import {createClient} from "@/lib/supabase/server";
export function serviceClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Server-side finance storage configuration is missing.");
  return createServiceClientBase(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function workspaceUser(){
  const db=await createClient();
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user)return null;
  const {data:member, error:memberError}=await db.from("workspace_members").select("user_id").eq("user_id",user.id).maybeSingle();
  if(memberError||!member)return null;
  return {user,db};
}
export function sameOrigin(request:Request){
  const origin=request.headers.get("origin");
  return !origin||origin===new URL(request.url).origin;
}
