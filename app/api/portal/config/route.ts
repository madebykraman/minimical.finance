import {NextResponse} from "next/server";
import {workspaceUser,serviceClient,sameOrigin} from "@/lib/ledger/server";
import {passwordHash} from "@/lib/ledger/portal";
export async function GET(){
  if(!await workspaceUser())return NextResponse.json({error:"Unauthorised"},{status:401});
  try{const db=serviceClient();const {data,error}=await db.from("tracker_portal_access").select("enabled").eq("id",true).maybeSingle();
  if(error)throw error;return NextResponse.json({enabled:!!data?.enabled});}
  catch{return NextResponse.json({error:"Portal configuration unavailable"},{status:503})}
}
export async function POST(request:Request){
  if(!sameOrigin(request))return NextResponse.json({error:"Origin mismatch"},{status:403});
  if(!await workspaceUser())return NextResponse.json({error:"Unauthorised"},{status:401});
  const body=await request.json().catch(()=>({}));
  if(typeof body.enabled!=="boolean"||typeof body.password!=="string")return NextResponse.json({error:"Invalid settings"},{status:400});
  if(body.password&&body.password.length<12)return NextResponse.json({error:"Use at least 12 characters for the portal password."},{status:400});
  try{
    const db=serviceClient();const {data:previous,error:readError}=await db.from("tracker_portal_access").select("password_hash").eq("id",true).maybeSingle();
    if(readError)throw readError;
    if(body.enabled&&!body.password&&!previous?.password_hash)return NextResponse.json({error:"Create a password before enabling client access."},{status:400});
    const payload:any={enabled:body.enabled,updated_at:new Date().toISOString(),failed_count:0,locked_until:null};
    if(body.password)payload.password_hash=passwordHash(body.password);
    const {error}=await db.from("tracker_portal_access").upsert({id:true,...payload});
    if(error)throw error;
    if(body.password||!body.enabled){
      const {error:revokeError}=await db.from("tracker_portal_sessions").delete().gt("expires_at","1970-01-01");
      if(revokeError)throw revokeError;
    }
    return NextResponse.json({ok:true,enabled:body.enabled});
  }catch{return NextResponse.json({error:"Client portal settings could not be saved."},{status:503})}
}
