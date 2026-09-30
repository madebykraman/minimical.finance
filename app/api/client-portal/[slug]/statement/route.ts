import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";

const A4:[number,number]=[595.2756,841.8898]; const BLACK=rgb(0,0,0); const MUTED=rgb(.42,.42,.40); const LINE=rgb(.86,.85,.82);
const money=(n:number)=>`₹${Math.round(n||0).toLocaleString("en-IN")}`;
function fyStart(now=new Date()){return new Date(now.getMonth()>=3?now.getFullYear():now.getFullYear()-1,3,1)}
function bounds(period:string){const now=new Date();const end=new Date(now.getFullYear(),now.getMonth()+1,0);if(period==="month")return [new Date(now.getFullYear(),now.getMonth(),1),end];if(period==="3months")return [new Date(now.getFullYear(),now.getMonth()-2,1),end];if(period==="6months")return [new Date(now.getFullYear(),now.getMonth()-5,1),end];if(period==="fy")return [fyStart(now),new Date(fyStart(now).getFullYear()+1,2,31)];return [new Date(2000,0,1),new Date(2100,11,31)]}
function d(s:string){return s?new Date(s+"T00:00:00"):new Date(0)}
function fmt(s:string){return new Date(s+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
function label(period:string){if(period==="month")return "This month";if(period==="3months")return "Last 3 months";if(period==="6months")return "Last 6 months";if(period==="fy"){const s=fyStart();return `FY ${s.getFullYear()}-${String(s.getFullYear()+1).slice(-2)}`;}return "All time"}

export async function GET(request:NextRequest,context:{params:Promise<{slug:string}>}){
  const {slug}=await context.params; const session=request.cookies.get("finos_portal_session")?.value||""; const period=request.nextUrl.searchParams.get("period")||"all";
  if(!session)return new NextResponse("Unauthorized",{status:401});
  const supabase=await createClient(); const {data,error}=await supabase.rpc("get_client_portal",{p_slug:slug,p_session:hashPortalSession(session)});
  if(error||!data)return new NextResponse("Portal unavailable",{status:401});
  const payload:any=data; const [start,end]=bounds(period); const invoices=payload.invoices||[]; const payments=payload.payments||[];
  const transactions:any[]=[
    ...invoices.filter((i:any)=>d(i.issue_date)<start).map((i:any)=>({date:i.issue_date,type:"invoice",ref:"#"+i.invoice_number,debit:Number(i.total||0),credit:0})),
    ...payments.filter((p:any)=>p.payment_date&&d(p.payment_date)<start).map((p:any)=>({date:p.payment_date,type:"payment",ref:p.receipt_number||p.id.slice(0,8),debit:0,credit:Number(p.amount||0)})),
    ...invoices.filter((i:any)=>d(i.issue_date)>=start&&d(i.issue_date)<=end).map((i:any)=>({date:i.issue_date,type:"invoice",ref:"#"+i.invoice_number,debit:Number(i.total||0),credit:0})),
    ...payments.filter((p:any)=>p.payment_date&&d(p.payment_date)>=start&&d(p.payment_date)<=end).map((p:any)=>({date:p.payment_date,type:"payment",ref:p.receipt_number||p.id.slice(0,8),debit:0,credit:Number(p.amount||0)}))
  ].sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
  const opening=transactions.filter((x:any)=>d(x.date)<start).reduce((s:number,x:any)=>s+x.debit-x.credit,0);
  const current=transactions.filter((x:any)=>d(x.date)>=start&&d(x.date)<=end); let running=opening;
  const billed=current.reduce((s:number,x:any)=>s+x.debit,0); const paid=current.reduce((s:number,x:any)=>s+x.credit,0); const closing=opening+billed-paid;

  const pdf=await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const regular=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","DejaVuSans.ttf")),{subset:true});
  const bold=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","DejaVuSans-Bold.ttf")),{subset:true});
  let page=pdf.addPage(A4); const W=A4[0],H=A4[1];
  const text=(s:string,x:number,y:number,size=8,font:any=regular,color:any=BLACK)=>page.drawText(String(s||""),{x,y,size,font,color});
  const right=(s:string,x:number,y:number,size=8,font:any=regular,color:any=BLACK)=>{const v=String(s||"");text(v,x-font.widthOfTextAtSize(v,size),y,size,font,color)};
  const header=()=>{text("FinOS",48,H-52,16,bold);text("ACCOUNT STATEMENT",48,H-69,8,bold,MUTED);text(payload.client.legal_name||payload.client.name,48,H-100,11,bold);text(label(period),W-48-(bold.widthOfTextAtSize(label(period),8)),H-100,8,bold);text(new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),W-48-regular.widthOfTextAtSize(new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),8),H-116,8,regular,MUTED);
    const cards=[["OPENING",money(opening)],["BILLED",money(billed)],["PAID",money(paid)],["CLOSING",money(closing)]];
    cards.forEach(([k,v],idx)=>{const x=48+idx*124;page.drawRectangle({x,y:H-174,width:112,height:40,borderWidth:.5,borderColor:LINE});text(k,x+8,H-151,6.5,bold,MUTED);text(v,x+8,H-167,10,bold)});};
  header(); let y=H-208;
  const drawTableHeader=()=>{page.drawLine({start:{x:48,y},end:{x:W-48,y},thickness:.6,color:BLACK});y-=18;text("DATE",48,y,6.5,bold,MUTED);text("TYPE",125,y,6.5,bold,MUTED);text("REFERENCE",195,y,6.5,bold,MUTED);right("DEBIT",415,y,6.5,bold,MUTED);right("CREDIT",480,y,6.5,bold,MUTED);right("BALANCE",547,y,6.5,bold,MUTED);y-=10;page.drawLine({start:{x:48,y},end:{x:W-48,y},thickness:.4,color:LINE)};
  };
  drawTableHeader();
  for(const tx of current){if(y<90){page=pdf.addPage(A4);y=H-60;text("FinOS",48,y,14,bold);y-=22;drawTableHeader();}
    running+=tx.debit-tx.credit;text(fmt(tx.date),48,y,7.5);text(tx.type==="invoice"?"Invoice":"Payment",125,y,7.5,bold);text(tx.ref,195,y,7.5);right(tx.debit?money(tx.debit):"—",415,y,7.5);right(tx.credit?money(tx.credit):"—",480,y,7.5);right(money(running),547,y,7.5);page.drawLine({start:{x:48,y:y-7},end:{x:W-48,y:y-7},thickness:.25,color:LINE});y-=19;
  }
  if(!current.length)text("No transactions in this period.",48,y,8,regular,MUTED);
  text("Statement of account · Invoice charges are debits; recorded payments are credits.",48,42,6.5,regular,MUTED);
  const bytes=await pdf.save();
  return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition:`attachment; filename="${String(payload.client.name).replace(/[^a-z0-9]+/gi,"-")}-Account-Statement.pdf"`,"Cache-Control":"private, no-store"}});
}
