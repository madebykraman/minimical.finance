import {type EmailOtpType} from "@supabase/supabase-js";
import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
export async function GET(request:NextRequest){
  const url=new URL(request.url);
  const supabase=await createClient();
  const token=url.searchParams.get("token_hash"),type=url.searchParams.get("type") as EmailOtpType|null;
  const code=url.searchParams.get("code");
  let error;
  if(token&&type){const res=await supabase.auth.verifyOtp({token_hash:token,type});error=res.error;}
  else if(code){const res=await supabase.auth.exchangeCodeForSession(code);error=res.error;}
  else error=new Error("Invalid verification link");
  if(error)return NextResponse.redirect(new URL("/?auth=invalid",request.url));
  const target=url.searchParams.get("next");
  const safeTarget=target==="/reset-password"?target:"/admin";
  return NextResponse.redirect(new URL(safeTarget,request.url));
}
