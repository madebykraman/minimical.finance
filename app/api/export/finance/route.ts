import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(){
 const supabase=await createClient();const {data:user}=await supabase.auth.getUser();if(!user.user)return new NextResponse("Unauthorized",{status:401});
 const [clients,projects,invoices,contents,payments,documents,organizations]=await Promise.all([
  supabase.from("clients").select("*"),supabase.from("projects").select("*"),supabase.from("invoices").select("*"),
  supabase.from("invoice_contents").select("*"),supabase.from("payments").select("*"),supabase.from("documents").select("*"),supabase.from("organizations").select("*")
 ]);
 const payload={exported_at:new Date().toISOString(),clients:clients.data||[],projects:projects.data||[],invoices:invoices.data||[],invoice_contents:contents.data||[],payments:payments.data||[],documents:documents.data||[],organizations:organizations.data||[]};
 return new NextResponse(JSON.stringify(payload,null,2),{headers:{"Content-Type":"application/json","Content-Disposition": 'attachment; filename="finos-export.json"',"Cache-Control":"private,no-store"}});
}