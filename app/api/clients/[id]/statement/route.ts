import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderStatementPdf } from "@/lib/finance/statement-pdf";

function bounds(period:string){
  const now=new Date();
  const end=new Date(now.getFullYear(),now.getMonth()+1,0);
  if(period==="month")return [new Date(now.getFullYear(),now.getMonth(),1),end];
  if(period==="3months")return [new Date(now.getFullYear(),now.getMonth()-2,1),end];
  if(period==="6months")return [new Date(now.getFullYear(),now.getMonth()-5,1),end];
  if(period==="fy"){
    const startYear=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;
    return [new Date(startYear,3,1),new Date(startYear+1,2,31)];
  }
  return [new Date(2000,0,1),new Date(2100,11,31)];
}
function iso(d:Date){return d.toISOString().slice(0,10)}
function periodLabel(period:string,start:Date,end:Date){
  if(period==="month")return "This month";
  if(period==="3months")return "Last 3 months";
  if(period==="6months")return "Last 6 months";
  if(period==="fy")return `FY ${start.getFullYear()}-${String(start.getFullYear()+1).slice(-2)}`;
  return "All time";
}

export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;
  const period=request.nextUrl.searchParams.get("period")||"all";
  const supabase=await createClient();
  const {data:user}=await supabase.auth.getUser();
  if(!user.user)return new NextResponse("Unauthorized",{status:401});

  const {data:client,error:clientError}=await supabase.from("clients").select("*,organizations(*)").eq("id",id).maybeSingle();
  if(clientError||!client)return new NextResponse("Client not found",{status:404});
  const org=(client as any).organizations||{};
  const [start,end]=bounds(period);
  const startIso=iso(start),endIso=iso(end);

  const {data:rows,error}=await supabase.rpc("statement_ledger",{p_client_id:id,p_start:"2000-01-01",p_end:endIso});
  if(error)return new NextResponse("Statement unavailable",{status:500});

  const allRows=(rows||[]).map((row:any)=>({
    transaction_date:String(row.transaction_date),
    transaction_type:String(row.transaction_type),
    reference:String(row.reference||""),
    debit:Number(row.debit||0),
    credit:Number(row.credit||0),
    running_balance:Number(row.running_balance||0),
  }));
  const openingRows=allRows.filter(row=>row.transaction_date<startIso);
  const openingBalance=openingRows.length?openingRows[openingRows.length-1].running_balance:0;
  const currentRows=allRows.filter(row=>row.transaction_date>=startIso&&row.transaction_date<=endIso);
  let running=openingBalance;
  const ledger=currentRows.map(row=>{
    running+=row.debit-row.credit;
    return {...row,running_balance:running};
  });

  const bytes=await renderStatementPdf({
    organization:org,
    client:client as any,
    periodLabel:periodLabel(period,start,end),
    periodStart:startIso,
    periodEnd:endIso,
    rows:ledger,
    openingBalance,
  });
  const filename=`${String((client as any).name||"Client").replace(/[^a-z0-9]+/gi,"-")}-Account-Statement.pdf`;
  return new NextResponse(bytes,{headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":`attachment; filename="${filename}"`,
    "Cache-Control":"private, no-store",
  }});
}
