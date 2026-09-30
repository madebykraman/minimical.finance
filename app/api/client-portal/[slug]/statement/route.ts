import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";

const A4=[595.2756,841.8898] as const;
const BLACK=rgb(0,0,0);
const GRAY=rgb(.45,.45,.42);
const money=(n:number)=>`₹${Math.round(n||0).toLocaleString("en-IN")}`;

function periodBounds(period:string){
  const now=new Date(); const y=now.getFullYear(); const m=now.getMonth();
  if(period==="month") return [new Date(y,m,1),new Date(y,m+1,0)];
  if(period==="quarter"){const q=Math.floor(m/3)*3;return [new Date(y,q,1),new Date(y,q+3,0)]}
  if(period==="half"){const h=m<6?0:6;return [new Date(y,h,1),new Date(y,h+6,0)]}
  if(period==="year") return [new Date(y,0,1),new Date(y,12,0)];
  return [new Date(2000,0,1),new Date(2100,11,31)];
}
function fmt(d:string){return new Date(d+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});}
function within(d:string,start:Date,end:Date){const x=new Date(d+"T00:00:00");return x>=start&&x<=end;}

export async function GET(request:NextRequest,context:{params:Promise<{slug:string}>}){
  const {slug}=await context.params; const token=request.nextUrl.searchParams.get("token"); const period=request.nextUrl.searchParams.get("period")||"all";
  if(!token)return new NextResponse("Unauthorized",{status:401});
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("get_client_portal",{p_slug:slug,p_token:token});
  if(error||!data)return new NextResponse("Portal unavailable",{status:404});
  const payload:any=data; const [start,end]=periodBounds(period);
  const invoices=(payload.invoices||[]).filter((i:any)=>within(i.issue_date,start,end));
  const payments=(payload.payments||[]).filter((p:any)=>!p.payment_date||within(p.payment_date,start,end));
  const billed=invoices.reduce((s:number,i:any)=>s+Number(i.total||0),0);
  const paid=invoices.reduce((s:number,i:any)=>s+Number(i.paid||0),0);
  const open=invoices.reduce((s:number,i:any)=>s+Number(i.balance||0),0);

  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const regular=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","DejaVuSans.ttf")),{subset:true});
  const bold=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","DejaVuSans-Bold.ttf")),{subset:true});
  const page=pdf.addPage(A4); const W=A4[0],H=A4[1];
  const text=(s:string,x:number,y:number,size=9,font=regular,color=BLACK)=>page.drawText(String(s||""),{x,y,size,font,color});
  const right=(s:string,x:number,y:number,size=9,font=regular)=>{const v=String(s||"");text(v,x-font.widthOfTextAtSize(v,size),y,size,font)};
  page.drawText("minimical.finance",{x:48,y:H-55,size:15,font:bold,color:BLACK});
  text("ACCOUNT STATEMENT",48,H-76,8,bold,GRAY);
  text(payload.client.legal_name||payload.client.name,48,H-112,11,bold);
  if(payload.client.email)text(payload.client.email,48,H-128,8,regular,GRAY);
  const periodTitle=period==="all"?"All time":period==="month"?"This month":period==="quarter"?"This quarter":period==="half"?"This half":"This year";
  right(periodTitle,W-48,H-112,9,bold); right(new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),W-48,H-128,8,regular,GRAY);
  const cards=[["BILLED",money(billed)],["PAID",money(paid)],["OPEN",money(open)]];
  cards.forEach(([label,value],i)=>{const x=48+i*166;page.drawRectangle({x,y:H-188,width:150,height:42,borderWidth:.5,borderColor:rgb(.88,.87,.83)});text(label,x+10,H-163,7,bold,GRAY);text(value,x+10,H-180,11,bold)});
  let currentPage=page; let y=H-226; page.drawLine({start:{x:48,y},end:{x:W-48,y},thickness:.6,color:BLACK});y-=20;
  text("INVOICE",48,y,7,bold,GRAY);text("DATE",132,y,7,bold,GRAY);text("STATUS",230,y,7,bold,GRAY);right("BILLED",405,y,7,bold,GRAY);right("PAID",470,y,7,bold,GRAY);right("OPEN",547,y,7,bold,GRAY);
  y-=10;page.drawLine({start:{x:48,y},end:{x:W-48,y},thickness:.4,color:rgb(.88,.87,.83)});
  for(const i of invoices){y-=22;if(y<100){currentPage=pdf.addPage(A4);y=H-70;currentPage.drawText("ACCOUNT STATEMENT · CONTINUED",{x:48,y,size:8,font:bold,color:GRAY});y-=28;}text("#"+i.invoice_number,48,y,8,bold);text(fmt(i.issue_date),132,y,8);text(i.balance>0?(i.is_overdue?"OVERDUE":"OPEN"):"PAID",230,y,7,bold);right(money(i.total),405,y,8);right(money(i.paid),470,y,8);right(money(i.balance),547,y,8);page.drawLine({start:{x:48,y:y-7},end:{x:W-48,y:y-7},thickness:.25,color:rgb(.92,.91,.88)})}
  y-=34;text("PAYMENTS",48,y,8,bold,GRAY);y-=17;
  for(const p of payments){if(y<65){currentPage=pdf.addPage(A4);y=H-70;currentPage.drawText("PAYMENTS · CONTINUED",{x:48,y,size:8,font:bold,color:GRAY});y-=28;}text(fmt(p.payment_date||new Date().toISOString().slice(0,10)),48,y,8);text(money(p.amount),150,y,8,bold);text(String(p.method||"").replace("_"," "),245,y,8);text(p.reference||"Recorded payment",360,y,8,regular,GRAY);y-=18}
  text("Generated from minimical.finance · This statement consolidates the account; individual invoice PDFs are supporting documents.",48,38,7,regular,GRAY);
  const bytes=await pdf.save();
  return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${payload.client.name}-Account-Statement.pdf"`,"Cache-Control":"private, no-store"}});
}
