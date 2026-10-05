import { NextResponse } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getDocumentTemplate } from "@/lib/finance/document-templates";

const W=595.2756,H=841.8898,L=54,R=W-54;const BLACK=rgb(.08,.08,.08),MUTED=rgb(.38,.38,.38),LINE=rgb(.78,.78,.78),SOFT=rgb(.96,.96,.95);
const safe=(v:unknown)=>String(v??"").replace(/[\r\n\t]+/g," ").trim();
const money=(v:number)=>`₹${Math.round(v||0).toLocaleString("en-IN")}/-`;
const dateLabel=(v?:string|null)=>{if(!v)return "—";const d=new Date(v+"T00:00:00");return Number.isNaN(d.getTime())?v:d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});};
function text(p:any,v:string,x:number,y:number,f:any,s=9,c=BLACK){p.drawText(safe(v),{x,y,font:f,size:s,color:c});}
function right(p:any,v:string,x:number,y:number,f:any,s=9,c=BLACK){const q=safe(v);p.drawText(q,{x:x-f.widthOfTextAtSize(q,s),y,font:f,size:s,color:c});}
function icon(p:any,x:number,y:number,type:"person"|"mail"|"phone"){if(type==="mail"){p.drawRectangle({x,y,width:9,height:6,borderWidth:.55,borderColor:MUTED});p.drawLine({start:{x,y:y+6},end:{x:x+4.5,y:y+2.5},thickness:.45,color:MUTED});p.drawLine({start:{x:x+9,y:y+6},end:{x:x+4.5,y:y+2.5},thickness:.45,color:MUTED});return}if(type==="phone"){p.drawCircle({x:x+4.5,y:y+4.5,size:4.5,borderWidth:.55,borderColor:MUTED});return}p.drawRectangle({x,y,width:8,height:9,borderWidth:.55,borderColor:MUTED});p.drawCircle({x:x+4,y:y+6.2,size:1.7,borderWidth:.45,borderColor:MUTED});}
async function embedLogo(pdf:any,url:string|null|undefined){if(!url)return null;try{const r=await fetch(url,{cache:"no-store"});if(!r.ok)return null;const b=new Uint8Array(await r.arrayBuffer());const t=(r.headers.get("content-type")||"").toLowerCase();return t.includes("png")||url.toLowerCase().includes(".png")?await pdf.embedPng(b):await pdf.embedJpg(b);}catch{return null}}

export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
 const {id}=await context.params;const supabase=await createClient();const {data:user}=await supabase.auth.getUser();if(!user.user)return new NextResponse("Unauthorized",{status:401});
 const {data:payment,error}=await supabase.from("payments").select("*,invoices(*,clients(*),organizations(*))").eq("id",id).maybeSingle();if(error||!payment)return new NextResponse("Payment not found",{status:404});
 const invoice:any=payment.invoices||{},client:any=invoice.clients||{},org:any=invoice.organizations||{};const templateKey=getDocumentTemplate("receipt-v1","receipt")?.key||"receipt-v1";
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const regular=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","Geist-Regular.ttf")),{subset:true});const bold=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","Geist-SemiBold.ttf")),{subset:true});const mono=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","GeistMono-Regular.ttf")),{subset:true});const logo=await embedLogo(pdf,org.logo_path);
 const p=pdf.addPage([W,H]);if(logo){const d=logo.scale(Math.min(40/logo.width,24/logo.height));p.drawImage(logo,{x:L,y:788-d.height,width:d.width,height:d.height});}
 text(p,"PAYMENT RECEIPT",L,788,bold,7.5,MUTED);text(p,safe(org.name||org.legal_name||"Organisation"),L,766,bold,13);right(p,`RECEIPT ${safe(payment.receipt_number||"")}`,R,788,mono,9);right(p,dateLabel(payment.payment_date),R,766,regular,9);p.drawLine({start:{x:L,y:749},end:{x:R,y:749},thickness:.65,color:LINE});
 text(p,"RECEIVED FROM",L,721,bold,7.5,MUTED);icon(p,L-12,720,"person");text(p,safe(client.legal_name||client.name||"Client"),L,700,bold,11);if(client.email)text(p,safe(client.email),L,685,regular,8,MUTED);
 p.drawRectangle({x:L,y:602,width:R-L,height:62,color:SOFT});text(p,"AMOUNT RECEIVED",L+14,643,bold,7.5,MUTED);text(p,money(Number(payment.amount||0)),L+14,616,mono,19);
 text(p,"PAYMENT DETAILS",L,567,bold,7.5,MUTED);p.drawLine({start:{x:L,y:556},end:{x:R,y:556},thickness:.55,color:LINE});
 const facts=[["INVOICE",`#${safe(invoice.invoice_number||"")}`],["PAYMENT DATE",dateLabel(payment.payment_date)],["METHOD",String(payment.method||"").replaceAll("_"," ").toUpperCase()],["REFERENCE",payment.reference||"—"],["INVOICE TOTAL",money(Number(invoice.source_total||invoice.total_amount||0))]];
 facts.forEach(([label,value],i)=>{const yy=532-i*27;text(p,label,L,yy,bold,7.2,MUTED);text(p,String(value),L+112,yy,regular,8.5);});
 p.drawRectangle({x:L,y:335,width:R-L,height:62,borderWidth:.55,borderColor:LINE});text(p,"RECORD",L+12,375,bold,7.2,MUTED);text(p,"This receipt records the payment captured against the invoice above.",L+12,355,regular,8.2);if(payment.notes)text(p,safe(payment.notes),L+12,340,regular,7.5,MUTED);
 p.drawLine({start:{x:L,y:53},end:{x:R,y:53},thickness:.55,color:LINE});text(p,safe(org.invoice_footer_line_2)||"Thank you for your time.",L,39,regular,8.5);const email=safe(org.email),phone=safe(org.phone);if(email){icon(p,L,19,"mail");text(p,email,L+14,19,regular,7.5,MUTED);}if(phone){const phoneX=email?L+185:L;icon(p,phoneX,19,"phone");text(p,phone,phoneX+14,19,regular,7.5,MUTED);}
 const bytes=await pdf.save();const checksum=createHash("sha256").update(bytes).digest("hex");const fileName=`Receipt-${safe(payment.receipt_number||invoice.invoice_number||id.slice(0,8))}.pdf`;const filePath=`organizations/${payment.organization_id}/receipts/${payment.id}/v1.pdf`;
 const {data:document}=await supabase.from("documents").select("id").eq("payment_id",id).eq("document_type","receipt_pdf").eq("version_number",1).maybeSingle();
 if(document?.id){const upload=await supabase.storage.from("finos-documents").upload(filePath,bytes,{contentType:"application/pdf",upsert:true});const generatedAt=new Date().toISOString();await supabase.from("documents").update({status:upload.error?"generated":"stored",file_path:upload.error?"":filePath,file_name:fileName,storage_bucket:"finos-documents",generated_at:generatedAt,checksum_sha256:checksum,size_bytes:bytes.length,template_key:templateKey}).eq("id",document.id);await supabase.from("document_versions").upsert({document_id:document.id,version_number:1,file_path:upload.error?null:filePath,file_name:fileName,storage_bucket:"finos-documents",mime_type:"application/pdf",size_bytes:bytes.length,checksum_sha256:checksum,generated_at:generatedAt,generated_by:user.user.id,metadata:{template_key:templateKey,storage_error:upload.error?.message??null}},{onConflict:"document_id,version_number"});}
 return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${fileName}"`,"Cache-Control":"private, no-store"}});
}
