import { NextRequest,NextResponse } from "next/server";
import { PDFDocument,rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";

async function embedLogo(pdf:any,url:string|null|undefined){if(!url)return null;try{const r=await fetch(url,{cache:"no-store"});if(!r.ok)return null;const b=new Uint8Array(await r.arrayBuffer());const t=(r.headers.get("content-type")||"").toLowerCase();return t.includes("png")||url.toLowerCase().includes(".png")?await pdf.embedPng(b):await pdf.embedJpg(b)}catch{return null}}
const money=(n:number)=>`₹${Math.round(n||0).toLocaleString("en-IN")}`;
const fmt=(s:string)=>s?new Date(s+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"}):"—";
const hexRgb=(hex:string)=>{const h=String(hex||"#171716").replace("#","");const n=parseInt(h.length===6?h:"171716",16);return rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255)};

export async function GET(request:NextRequest,context:{params:Promise<{slug:string;paymentId:string}>}){
  const {slug,paymentId}=await context.params; const session=request.cookies.get("portal_session")?.value||"";
  if(!session)return new NextResponse("Unauthorized",{status:401});
  const supabase=await createClient(); const [{data,error},{data:orgRaw}]=await Promise.all([supabase.rpc("get_client_portal",{p_slug:slug,p_session:hashPortalSession(session)}),supabase.rpc("get_client_portal_organization",{p_slug:slug,p_session:hashPortalSession(session)})]);
  if(error||!data)return new NextResponse("Portal unavailable",{status:401});
  await supabase.rpc("log_client_portal_activity",{p_slug:slug,p_session:hashPortalSession(session),p_action:"receipt_downloaded",p_resource_type:"payment",p_resource_id:paymentId});
  const payload:any=data; const org:any=orgRaw||{}; const payment=(payload.payments||[]).find((p:any)=>p.id===paymentId);
  if(!payment)return new NextResponse("Receipt not found",{status:404});
  const invoice=(payload.invoices||[]).find((i:any)=>i.id===payment.invoice_id);
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const accent=hexRgb(org.accent_hex||"#171716");
  const regular=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","Geist-Regular.ttf")),{subset:true});
  const bold=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","Geist-SemiBold.ttf")),{subset:true});
  const mono=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","GeistMono-Regular.ttf")),{subset:true});
  const page=pdf.addPage([595.2756,841.8898]);const orgLogo=await embedLogo(pdf,org.logo_path);const clientLogo=await embedLogo(pdf,payload.client.logo_path);if(orgLogo){const d=orgLogo.scale(Math.min(48/orgLogo.width,24/orgLogo.height));page.drawImage(orgLogo,{x:48,y:794-d.height,width:d.width,height:d.height});}if(clientLogo){const d=clientLogo.scale(Math.min(48/clientLogo.width,24/clientLogo.height));page.drawImage(clientLogo,{x:499-d.width,y:794-d.height,width:d.width,height:d.height});}const drawReceiptIcon=(x:number,y:number,s=9)=>{page.drawCircle({x:x+s/2,y:y+s/2,size:s/2,borderColor:rgb(.25,.25,.24),borderWidth:.6});page.drawLine({start:{x:x+2.5,y:y+4.5},end:{x:x+4,y:y+2.8},thickness:.6,color:rgb(.25,.25,.24)});page.drawLine({start:{x:x+4,y:y+2.8},end:{x:x+7,y:y+6},thickness:.6,color:rgb(.25,.25,.24)});};
  const text=(s:string,x:number,y:number,size=9,font:any=regular,color:any=rgb(0,0,0))=>page.drawText(String(s||""),{x,y,size,font,color});
  text(String(org.name||org.legal_name||""),48,790,17,bold);drawReceiptIcon(34,768,9);text("PAYMENT RECEIPT",48,770,8,bold,rgb(.42,.42,.4));
  text(payload.client.legal_name||payload.client.name,48,724,11,bold);text(payload.client.email||"",48,708,8,regular,rgb(.42,.42,.4));
  const receiptNo=payment.receipt_number||`RCP-${payment.invoice_number}-${payment.id.slice(0,8)}`;
  const right=(s:string,y:number,size=8,font:any=regular,color:any=rgb(0,0,0))=>{const v=String(s||"");text(v,547-font.widthOfTextAtSize(v,size),y,size,font,color)};
  right(receiptNo,724,9,bold);right(fmt(payment.payment_date),708,8,regular,rgb(.42,.42,.4));
  page.drawRectangle({x:48,y:610,width:499,height:76,borderWidth:.8,borderColor:accent});
  text("AMOUNT RECEIVED",64,658,7,bold,rgb(.42,.42,.4));text(money(payment.amount),64,630,21,mono,accent);
  text("RECEIVED FROM",48,570,8,bold,rgb(.42,.42,.4));
  text(payload.client.legal_name||payload.client.name,48,548,9,bold);(payload.client.address_lines||[]).slice(0,3).forEach((v:string,i:number)=>text(v,48,534-i*13,7,regular,rgb(.45,.45,.43)));
  text("PAYMENT DETAILS",310,570,8,bold,rgb(.42,.42,.4));
  const rows=[["Invoice",invoice?"#"+invoice.invoice_number:"#"+payment.invoice_number],["Payment date",fmt(payment.payment_date)],["Method",String(payment.method||"").replaceAll("_"," ")],["Reference",payment.reference||"Not provided"],["Invoice total",invoice?money(invoice.total):"—"],["Remaining balance",invoice?money(invoice.balance):"—"]];
  rows.forEach((r,i)=>{const y=540-i*30;text(r[0],310,y,7,regular,rgb(.45,.45,.43));text(r[1],405,y,8,bold)});
  text("PAY TO",48,460,8,bold,rgb(.42,.42,.4));text(org?.payee_name||org?.legal_name||"Kumar Aman",48,442,8,bold);text(org?.bank_name||"",48,428,7,regular,rgb(.45,.45,.43));text(org?.account_number?"A/C "+org.account_number:"",48,416,7,regular,rgb(.45,.45,.43));text(org?.ifsc_code?"IFSC "+org.ifsc_code:"",48,404,7,regular,rgb(.45,.45,.43));
  text("This receipt confirms that the payment above was recorded against the referenced invoice.",48,280,8,regular,rgb(.42,.42,.4));
  text("Thank you for your business.",48,264,8,regular,rgb(.42,.42,.4));
  text(String(org.name||org.legal_name||"")+" · Payment record",48,42,6.5,regular,rgb(.55,.55,.52));
  const bytes=await pdf.save();return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition": `attachment; filename="${receiptNo}.pdf"`, "Cache-Control":"private, no-store"}});
}
