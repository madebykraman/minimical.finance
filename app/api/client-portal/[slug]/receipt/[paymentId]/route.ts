import { NextRequest,NextResponse } from "next/server";
import { PDFDocument,rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";

const W=595.2756,H=841.8898,L=54,R=W-54;
const BLACK=rgb(.08,.08,.08),MUTED=rgb(.38,.38,.38),LINE=rgb(.78,.78,.78),SOFT=rgb(.96,.96,.95);
const safe=(v:unknown)=>String(v??"").replace(/[\r\n\t]+/g," ").trim();
const money=(v:number)=>`₹${Math.round(v||0).toLocaleString("en-IN")}/-`;
const fmt=(s:string)=>s?new Date(s+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"—";

async function embedLogo(pdf:any,url:string|null|undefined){
  if(!url)return null;
  try{const r=await fetch(url,{cache:"no-store"});if(!r.ok)return null;const b=new Uint8Array(await r.arrayBuffer());const t=(r.headers.get("content-type")||"").toLowerCase();return t.includes("png")||url.toLowerCase().includes(".png")?await pdf.embedPng(b):await pdf.embedJpg(b)}catch{return null}
}
function text(p:any,v:string,x:number,y:number,f:any,s=9,c=BLACK){p.drawText(safe(v),{x,y,font:f,size:s,color:c});}
function right(p:any,v:string,x:number,y:number,f:any,s=9,c=BLACK){const q=safe(v);p.drawText(q,{x:x-f.widthOfTextAtSize(q,s),y,font:f,size:s,color:c});}
function icon(p:any,x:number,y:number,type:"person"|"mail"|"phone"){
  if(type==="mail"){p.drawRectangle({x,y,width:9,height:6,borderWidth:.55,borderColor:MUTED});p.drawLine({start:{x,y:y+6},end:{x:x+4.5,y:y+2.5},thickness:.45,color:MUTED});p.drawLine({start:{x:x+9,y:y+6},end:{x:x+4.5,y:y+2.5},thickness:.45,color:MUTED});return}
  if(type==="phone"){p.drawCircle({x:x+4.5,y:y+4.5,size:4.5,borderWidth:.55,borderColor:MUTED});return}
  p.drawRectangle({x,y,width:8,height:9,borderWidth:.55,borderColor:MUTED});p.drawCircle({x:x+4,y:y+6.2,size:1.7,borderWidth:.45,borderColor:MUTED});
}

export async function GET(request:NextRequest,context:{params:Promise<{slug:string;paymentId:string}>}){
  const {slug,paymentId}=await context.params;
  const session=request.cookies.get("portal_session")?.value||"";
  if(!session)return new NextResponse("Unauthorized",{status:401});
  const supabase=createServiceClient();
  const [{data,error},{data:orgRaw}]=await Promise.all([
    supabase.rpc("get_client_portal",{p_slug:slug,p_session:hashPortalSession(session)}),
    supabase.rpc("get_client_portal_organization",{p_slug:slug,p_session:hashPortalSession(session)})
  ]);
  if(error||!data)return new NextResponse("Portal unavailable",{status:401});
  await supabase.rpc("log_client_portal_activity",{p_slug:slug,p_session:hashPortalSession(session),p_action:"receipt_downloaded",p_resource_type:"payment",p_resource_id:paymentId});
  const payload:any=data;const org:any=orgRaw||{};const payment=(payload.payments||[]).find((p:any)=>p.id===paymentId);
  if(!payment)return new NextResponse("Receipt not found",{status:404});
  const invoice=(payload.invoices||[]).find((i:any)=>i.id===payment.invoice_id);
  const client:any=payload.client||{};
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const regular=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","Geist-Regular.ttf")),{subset:true});
  const bold=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","Geist-SemiBold.ttf")),{subset:true});
  const mono=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","GeistMono-Regular.ttf")),{subset:true});
  const page=pdf.addPage([W,H]);const orgLogo=await embedLogo(pdf,org.logo_path);const clientLogo=await embedLogo(pdf,client.logo_path);
  if(orgLogo){const d=orgLogo.scale(Math.min(40/orgLogo.width,22/orgLogo.height));page.drawImage(orgLogo,{x:L,y:788-d.height,width:d.width,height:d.height});}
  if(clientLogo){const d=clientLogo.scale(Math.min(34/clientLogo.width,20/clientLogo.height));page.drawImage(clientLogo,{x:R-d.width,y:788-d.height,width:d.width,height:d.height});}
  text(page,"PAYMENT RECEIPT",L,788,bold,7.5,MUTED);text(page,safe(org.name||org.legal_name||"Organisation"),L,766,bold,13);
  right(page,`RECEIPT ${safe(payment.receipt_number||"")}`,R,788,mono,9);right(page,fmt(payment.payment_date),R,766,regular,9);
  page.drawLine({start:{x:L,y:749},end:{x:R,y:749},thickness:.65,color:LINE});
  text(page,"RECEIVED FROM",L,721,bold,7.5,MUTED);icon(page,L-12,720,"person");text(page,safe(client.legal_name||client.name||"Client"),L,700,bold,11);
  if(client.email)text(page,safe(client.email),L,685,regular,8,MUTED);
  page.drawRectangle({x:L,y:602,width:R-L,height:62,color:SOFT});text(page,"AMOUNT RECEIVED",L+14,643,bold,7.5,MUTED);text(page,money(Number(payment.amount||0)),L+14,616,mono,19);
  text(page,"PAYMENT DETAILS",L,567,bold,7.5,MUTED);page.drawLine({start:{x:L,y:556},end:{x:R,y:556},thickness:.55,color:LINE});
  const facts=[["INVOICE",invoice?`#${safe(invoice.invoice_number)}`:"—"],["PAYMENT DATE",fmt(payment.payment_date)],["METHOD",String(payment.method||"").replaceAll("_"," ").toUpperCase()],["REFERENCE",payment.reference||"—"],["INVOICE TOTAL",invoice?money(Number(invoice.total||0)):"—"]];
  facts.forEach(([label,value],i)=>{const yy=532-i*27;text(page,label,L,yy,bold,7.2,MUTED);text(page,String(value),L+112,yy,regular,8.5);});
  page.drawRectangle({x:L,y:335,width:R-L,height:62,borderWidth:.55,borderColor:LINE});text(page,"RECORD",L+12,375,bold,7.2,MUTED);text(page,"This receipt records the payment captured against the invoice above.",L+12,355,regular,8.2);if(payment.notes)text(page,safe(payment.notes),L+12,340,regular,7.5,MUTED);
  page.drawLine({start:{x:L,y:53},end:{x:R,y:53},thickness:.55,color:LINE});text(page,safe(org.invoice_footer_line_2)||"Thank you for your time.",L,39,regular,8.5);const email=safe(org.email),phone=safe(org.phone);if(email){icon(page,L,19,"mail");text(page,email,L+14,19,regular,7.5,MUTED);}if(phone){const phoneX=email?L+185:L;icon(page,phoneX,19,"phone");text(page,phone,phoneX+14,19,regular,7.5,MUTED);}
  const bytes=await pdf.save();const receiptNo=payment.receipt_number||`RCP-${payment.id.slice(0,8)}`;
  return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${receiptNo}.pdf"`,"Cache-Control":"private, no-store"}});
}
