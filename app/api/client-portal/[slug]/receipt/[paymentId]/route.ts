import { NextRequest,NextResponse } from "next/server";
import { PDFDocument,rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";

const money=(n:number)=>`₹${Math.round(n||0).toLocaleString("en-IN")}`;
const fmt=(s:string)=>s?new Date(s+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"}):"—";

export async function GET(request:NextRequest,context:{params:Promise<{slug:string;paymentId:string}>}){
  const {slug,paymentId}=await context.params; const session=request.cookies.get("finos_portal_session")?.value||"";
  if(!session)return new NextResponse("Unauthorized",{status:401});
  const supabase=await createClient(); const {data,error}=await supabase.rpc("get_client_portal",{p_slug:slug,p_session:hashPortalSession(session)});
  if(error||!data)return new NextResponse("Portal unavailable",{status:401});
  const payload:any=data; const payment=(payload.payments||[]).find((p:any)=>p.id===paymentId);
  if(!payment)return new NextResponse("Receipt not found",{status:404});
  const invoice=(payload.invoices||[]).find((i:any)=>i.id===payment.invoice_id);
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const regular=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","DejaVuSans.ttf")),{subset:true});
  const bold=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","DejaVuSans-Bold.ttf")),{subset:true});
  const page=pdf.addPage([595.2756,841.8898]);const text=(s:string,x:number,y:number,size=9,font:any=regular,color:any=rgb(0,0,0))=>page.drawText(String(s||""),{x,y,size,font,color});
  text("FinOS",48,790,17,bold);text("PAYMENT RECEIPT",48,770,8,bold,rgb(.42,.42,.4));
  text(payload.client.legal_name||payload.client.name,48,724,11,bold);text(payload.client.email||"",48,708,8,regular,rgb(.42,.42,.4));
  const receiptNo=payment.receipt_number||`RCP-${payment.invoice_number}-${payment.id.slice(0,8)}`;
  const right=(s:string,y:number,size=8,font:any=regular)=>{const v=String(s||"");text(v,547-font.widthOfTextAtSize(v,size),y,size,font)};
  right(receiptNo,724,9,bold);right(fmt(payment.payment_date),708,8,regular,rgb(.42,.42,.4));
  page.drawRectangle({x:48,y:610,width:499,height:76,borderWidth:.6,borderColor:rgb(.85,.84,.81)});
  text("AMOUNT RECEIVED",64,658,7,bold,rgb(.42,.42,.4));text(money(payment.amount),64,630,21,bold);
  text("PAYMENT DETAILS",48,570,8,bold,rgb(.42,.42,.4));
  const rows=[["Invoice",invoice?"#"+invoice.invoice_number:"#"+payment.invoice_number],["Payment date",fmt(payment.payment_date)],["Method",String(payment.method||"").replaceAll("_"," ")],["Reference",payment.reference||"Not provided"],["Invoice total",invoice?money(invoice.total):"—"],["Remaining balance",invoice?money(invoice.balance):"—"]];
  rows.forEach((r,i)=>{const y=540-i*34;text(r[0],48,y,8,regular,rgb(.45,.45,.43));text(r[1],190,y,9,bold)});
  text("This receipt confirms that the payment above was recorded against the referenced invoice.",48,280,8,regular,rgb(.42,.42,.4));
  text("Thank you for your business.",48,264,8,regular,rgb(.42,.42,.4));
  text("FinOS · Payment record",48,42,6.5,regular,rgb(.55,.55,.52));
  const bytes=await pdf.save();return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition:`attachment; filename="${receiptNo}.pdf"`,"Cache-Control":"private, no-store"}});
}
