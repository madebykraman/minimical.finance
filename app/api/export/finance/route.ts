import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export async function GET(){
 const supabase=await createClient();
 const {data:user}=await supabase.auth.getUser();
 if(!user.user)return new NextResponse("Unauthorized",{status:401});
 const [clients,projects,invoices,contents,payments,documents,organizations,activity,projectActivity,portalActivity]=await Promise.all([
  supabase.from("clients").select("*"),supabase.from("projects").select("*"),supabase.from("invoices").select("*"),
  supabase.from("invoice_contents").select("*"),supabase.from("payments").select("*"),supabase.from("documents").select("*"),
  supabase.from("organizations").select("*"),supabase.from("activity_log").select("*"),supabase.from("project_activity").select("*"),
  supabase.from("client_portal_activity").select("*")
 ]);
 const payload={schema_version:2,exported_at:new Date().toISOString(),exported_by:user.user.id,
  clients:clients.data||[],projects:projects.data||[],invoices:invoices.data||[],invoice_contents:contents.data||[],
  payments:payments.data||[],documents:documents.data||[],organizations:organizations.data||[],
  activity_log:activity.data||[],project_activity:projectActivity.data||[],client_portal_activity:portalActivity.data||[]
 };
 const json=JSON.stringify(payload,null,2);
 const checksum=createHash("sha256").update(json).digest("hex");
 const envelope={manifest:{format:"finos-finance-export",schema_version:2,sha256:checksum,generated_at:payload.exported_at,storage_note:"Database metadata and file paths are exported. Private storage objects must also be backed up from the finos-documents and finos-assets buckets."},data:payload};
 return new NextResponse(JSON.stringify(envelope,null,2),{headers:{"Content-Type":"application/json","Content-Disposition":'attachment; filename="finos-finance-backup.json"',"Cache-Control":"private,no-store","X-FinOS-Backup-SHA256":checksum}});
}