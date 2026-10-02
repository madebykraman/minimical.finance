import { NextRequest,NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";
import { renderStatementPdf } from "@/lib/finance/statement-pdf";

function bounds(period:string){
  const now=new Date();const end=new Date(now.getFullYear(),now.getMonth()+1,0);
  if(period==="month")return [new Date(now.getFullYear(),now.getMonth(),1),end];
  if(period==="3months")return [new Date(now.getFullYear(),now.getMonth()-2,1),end];
  if(period==="6months")return [new Date(now.getFullYear(),now.getMonth()-5,1),end];
  if(period==="fy"){const y=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;return [new Date(y,3,1),new Date(y+1,2,31)]}
  return [new Date(2000,0,1),new Date(2100,11,31)];
}
const iso=(d:Date)=>d.toISOString().slice(0,10);
const label=(p:string,s:Date)=>p==="month"?"This month":p==="3months"?"Last 3 months":p==="6months"?"Last 6 months":p==="fy"?`FY ${s.getFullYear()}-${String(s.getFullYear()+1).slice(-2)}`:"All time";

export async function GET(request:NextRequest,context:{params:Promise<{slug:string}>}){
  const {slug}=await context.params;const session=request.cookies.get("portal_session")?.value||"";const period=request.nextUrl.searchParams.get("period")||"all";
  if(!session)return new NextResponse("Unauthorized",{status:401});
  const supabase=createServiceClient();
  const [{data,error},{data:orgData}]=await Promise.all([
    supabase.rpc("get_client_portal",{p_slug:slug,p_session:hashPortalSession(session)}),
    supabase.rpc("get_client_portal_organization",{p_slug:slug,p_session:hashPortalSession(session)})
  ]);
  if(error||!data)return new NextResponse("Portal unavailable",{status:401});
  await supabase.rpc("log_client_portal_activity",{p_slug:slug,p_session:hashPortalSession(session),p_action:"statement_downloaded",p_resource_type:"statement"});
  const payload:any=data;const org:any=orgData||{};const [start,end]=bounds(period);const client:any=payload.client||{};
  const {data:rows,error:ledgerError}=await supabase.rpc("statement_ledger",{p_client_id:client.id,p_start:"2000-01-01",p_end:iso(end)});
  if(ledgerError)return new NextResponse("Statement unavailable",{status:500});
  const all=(rows||[]).map((r:any)=>({transaction_date:String(r.transaction_date),transaction_type:String(r.transaction_type),reference:String(r.reference||""),debit:Number(r.debit||0),credit:Number(r.credit||0),running_balance:Number(r.running_balance||0)}));
  const openingRows=all.filter(r=>r.transaction_date<iso(start));const openingBalance=openingRows.length?openingRows[openingRows.length-1].running_balance:0;
  const current=all.filter(r=>r.transaction_date>=iso(start)&&r.transaction_date<=iso(end));let running=openingBalance;
  const ledger=current.map(r=>{running+=r.debit-r.credit;return {...r,running_balance:running}});
  const bytes=await renderStatementPdf({organization:org,client,periodLabel:label(period,start),periodStart:iso(start),periodEnd:iso(end),rows:ledger,openingBalance});
  return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${String(client.name||"Client").replace(/[^a-z0-9]+/gi,"-")}-Account-Statement.pdf"`,"Cache-Control":"private, no-store"}});
}
