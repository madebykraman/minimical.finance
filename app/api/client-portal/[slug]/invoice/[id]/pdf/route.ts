import { NextRequest,NextResponse } from "next/server";
import { PDFDocument,rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";

const PAGE={width:595.2756,height:841.8898};const BLACK=rgb(0,0,0);const FONT_SIZE=9.8;const LEADING=11.8;
const X={left:62.42,right:536.6,divider:419.3,metaRight:520.2,descriptionCenter:240.86,amountCenter:477.95};
const Y={billedLabel:772.46,billedFirst:756.65,payLabel:671.4,payFirst:655.58,invoiceLabel:772.46,invoiceNumber:756.65,dateLabel:721.49,dateValue:706.55,tableTop:538.7,tableHeader:511.46,tableTotal:148.52,tableBottom:125.67,totalBaseline:133.65,footer1:57.12,footer2:42.18};
const safe=(v:any)=>String(v??"").replace(/[\r\n\t]+/g," ");
async function embedLogo(pdf:any,url:string|null|undefined){if(!url)return null;try{const r=await fetch(url,{cache:"no-store"});if(!r.ok)return null;const b=new Uint8Array(await r.arrayBuffer());const t=(r.headers.get("content-type")||"").toLowerCase();return t.includes("png")||url.toLowerCase().includes(".png")?await pdf.embedPng(b):await pdf.embedJpg(b)}catch{return null}}
const money=(n:number)=>`₹${Math.round(n).toLocaleString("en-IN")}/-`;
const unknown="₹X,XXX/-";
const formatDate=(v:string)=>{const d=new Date(v+"T00:00:00");const day=d.getDate();const suffix=day%100>=11&&day%100<=13?"th":day%10===1?"st":day%10===2?"nd":day%10===3?"rd":"th";return `${day}${suffix} ${d.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}`};
const wrap=(t:string,font:any,max:number)=>{const out:string[]=[];let cur="";for(const w of safe(t).split(/\s+/).filter(Boolean)){const c=cur?cur+" "+w:w;if(!cur||font.widthOfTextAtSize(c,FONT_SIZE)<=max)cur=c;else{out.push(cur);cur=w}}if(cur)out.push(cur);return out};

export async function GET(request:NextRequest,context:{params:Promise<{slug:string;id:string}>}){
  const {slug,id}=await context.params;const session=request.cookies.get("finos_portal_session")?.value||"";if(!session)return new NextResponse("Unauthorized",{status:401});
  const supabase=await createClient();const [{data,error},{data:orgRaw}]=await Promise.all([
    supabase.rpc("get_client_portal",{p_slug:slug,p_session:hashPortalSession(session)}),
    supabase.rpc("get_client_portal_organization",{p_slug:slug,p_session:hashPortalSession(session)})
  ]);
  if(error||!data)return new NextResponse("Portal unavailable",{status:401});
  await supabase.rpc("log_client_portal_activity",{p_slug:slug,p_session:hashPortalSession(session),p_action:"invoice_pdf_downloaded",p_resource_type:"invoice",p_resource_id:id});
  const org:any=orgRaw||{}; const templateKey=org.invoice_template_key||"legacy_elle"; const invoice=(data as any).invoices.find((i:any)=>i.id===id);if(!invoice)return new NextResponse("Invoice not found",{status:404});
  const client=(data as any).client;const contents=[...(invoice.contents||[])].sort((a:any,b:any)=>Number(a.position)-Number(b.position));
  const total=contents.reduce((s:number,i:any)=>s+(i.priced?Number(i.amount??Number(i.quantity||1)*Number(i.rate||0)):0),0);const hasUnpriced=contents.some((i:any)=>!i.priced);
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const regular=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","Geist-Regular.ttf")),{subset:true});const bold=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","Geist-SemiBold.ttf")),{subset:true});
  const mono=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","GeistMono-Regular.ttf")),{subset:true});const orgLogo=await embedLogo(pdf,org.logo_path);const clientLogo=await embedLogo(pdf,client.logo_path);const page=pdf.addPage([PAGE.width,PAGE.height]);if(orgLogo){const d=orgLogo.scale(Math.min(48/orgLogo.width,24/orgLogo.height));page.drawImage(orgLogo,{x:X.left,y:794-d.height,width:d.width,height:d.height});}if(clientLogo){const d=clientLogo.scale(Math.min(48/clientLogo.width,24/clientLogo.height));page.drawImage(clientLogo,{x:X.right-d.width,y:794-d.height,width:d.width,height:d.height});}
  const draw=(s:string,x:number,y:number,font:any=regular,size=FONT_SIZE)=>page.drawText(safe(s),{x,y,size,font,color:BLACK});const drawDocIcon=(x:number,y:number,s=8)=>{page.drawRectangle({x,y,width:s,height:s,borderColor:BLACK,borderWidth:.5});page.drawLine({start:{x:x+2,y:y+5.5},end:{x:x+6,y:y+5.5},thickness:.45,color:BLACK});page.drawLine({start:{x:x+2,y:y+3},end:{x:x+5.5,y:y+3},thickness:.45,color:BLACK});};
  const center=(s:string,x:number,y:number,font:any=regular,size=FONT_SIZE)=>{const v=safe(s);draw(v,x-font.widthOfTextAtSize(v,size)/2,y,font,size)};const right=(s:string,x:number,y:number,font:any=regular,size=FONT_SIZE)=>{const v=safe(s);draw(v,x-font.widthOfTextAtSize(v,size),y,font,size)};
  drawDocIcon(X.left-14,Y.billedLabel-1,8);draw("BILLED TO:",X.left,Y.billedLabel,bold);const billed=[client.legal_name||client.name,...(client.address_lines||[]),client.pan?"PAN No. "+client.pan:"",client.gstin?"GSTIN: "+client.gstin:""].filter(Boolean);billed.forEach((s:string,i:number)=>draw(s,X.left,Y.billedFirst-i*LEADING));
  drawDocIcon(X.left-14,Y.payLabel-1,8);draw("PAY TO:",X.left,Y.payLabel,bold);const pay=[`NAME: ${org?.payee_name||org?.legal_name||"Kumar Aman"}`,org?.account_number?`A/C NO. ${org.account_number}`:"",org?.bank_name?`BANK: ${org.bank_name}`:"",org?.branch_name?`BRANCH: ${org.branch_name}`:"",org?.branch_code?`BRANCH CODE: ${org.branch_code}`:"",org?.ifsc_code?`IFSC CODE: ${org.ifsc_code}`:"",org?.pan?`PAN NO. ${org.pan}`:""].filter(Boolean);pay.forEach((s:string,i:number)=>draw(s,X.left,Y.payFirst-i*LEADING));
  right("INVOICE NO.",X.metaRight,Y.invoiceLabel,bold);right(String(invoice.invoice_number),X.metaRight,Y.invoiceNumber);right("DATE:",X.metaRight,Y.dateLabel,bold);right(formatDate(invoice.issue_date),X.metaRight,Y.dateValue);
  const line={thickness:.62,color:BLACK};page.drawRectangle({x:X.left,y:Y.tableBottom,width:X.right-X.left,height:Y.tableTop-Y.tableBottom,borderWidth:.62,borderColor:BLACK});page.drawLine({start:{x:X.divider,y:Y.tableBottom},end:{x:X.divider,y:Y.tableTop},...line});page.drawLine({start:{x:X.left,y:Y.tableHeader},end:{x:X.right,y:Y.tableHeader},...line});page.drawLine({start:{x:X.left,y:Y.tableTotal},end:{x:X.right,y:Y.tableTotal},...line});
  center("DESCRIPTION",X.descriptionCenter,Y.tableTop-17,bold);center("AMOUNT",X.amountCenter,Y.tableTop-17,bold);
  const n=Math.max(contents.length,1);const bodyTop=Y.tableHeader-32;const bodyBottom=Y.tableTotal+24;const step=n===1?0:Math.min(43,(bodyTop-bodyBottom)/(n-1));
  contents.forEach((item:any,index:number)=>{const slot=n===1?(bodyTop+bodyBottom)/2:bodyTop-index*step;const lines=wrap(item.title||"",regular,245).slice(0,3);const first=slot+((lines.length-1)*LEADING)/2;lines.forEach((s:string,j:number)=>center(s,X.descriptionCenter,first-j*LEADING));center(item.priced?money(Number(item.amount??Number(item.quantity||1)*Number(item.rate||0))):unknown,X.amountCenter,slot,mono)});
  center("TOTAL",X.descriptionCenter,Y.totalBaseline,bold);center(hasUnpriced?unknown:money(total),X.amountCenter,Y.totalBaseline,mono);
  draw(org?.invoice_footer_line_1||"Please contact framedbyaman@gmail.com in case of any queries.",X.left,Y.footer1,regular,9.4);draw(org?.invoice_footer_line_2||"Thank you for your time.",X.left,Y.footer2,regular,9.4);
  const bytes=await pdf.save();return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition": `attachment; filename="INV_${invoice.invoice_number}-${String(org.name||org.legal_name||"Invoice").replace(/[^a-z0-9]+/gi,"-")}.pdf"`, "Cache-Control":"private, no-store"}});
}
