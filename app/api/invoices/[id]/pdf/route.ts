import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getDocumentTemplate } from "@/lib/finance/document-templates";

const PAGE = { width: 595.2756, height: 841.8898 };
const BLACK = rgb(0.08,0.08,0.08);
const MUTED = rgb(0.38,0.38,0.38);
const LINE = rgb(0.78,0.78,0.78);
const SOFT = rgb(0.96,0.96,0.95);

function safe(value: unknown){return String(value??"").replace(/[\r\n\t]+/g," ").trim();}
function money(value:number){return `₹${Math.round(value||0).toLocaleString("en-IN")}/-`;}
function formatDate(value?:string|null){if(!value)return "";const d=new Date(value+"T00:00:00");if(Number.isNaN(d.getTime()))return value;return d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});}
function wrap(textValue:string,font:any,maxWidth:number,size:number){const words=safe(textValue).split(/\s+/).filter(Boolean);const lines:string[]=[];let current="";for(const word of words){const candidate=current?`${current} ${word}`:word;if(!current||font.widthOfTextAtSize(candidate,size)<=maxWidth)current=candidate;else{lines.push(current);current=word;}}if(current)lines.push(current);return lines;}
function text(page:any,value:string,x:number,y:number,font:any,size=9,color=BLACK){page.drawText(safe(value),{x,y,font,size,color});}
function right(page:any,value:string,rightX:number,y:number,font:any,size=9,color=BLACK){const v=safe(value);page.drawText(v,{x:rightX-font.widthOfTextAtSize(v,size),y,font,size,color});}
function icon(page:any,x:number,y:number,type:"document"|"person"|"bank"|"mail"|"phone"|"calendar"|"total"){
  const stroke=.65;
  if(type==="mail"){
    page.drawRectangle({x,y:y+1,width:11,height:7,borderWidth:stroke,borderColor:MUTED});
    page.drawLine({start:{x,y:y+8},end:{x:x+5.5,y:y+4.3},thickness:stroke,color:MUTED});
    page.drawLine({start:{x:x+11,y:y+8},end:{x:x+5.5,y:y+4.3},thickness:stroke,color:MUTED});
    return;
  }
  if(type==="phone"){
    page.drawSvgPath("M20.4 15.1c-1.2 1.2-2.6 2-4.1 2.4-3.5-1.7-6.2-4.4-7.9-7.9.4-1.5 1.2-2.9 2.4-4.1l1.8 1.8c.4.4.5.9.3 1.4l-.7 1.7c1.2 2 2.9 3.7 4.9 4.9l1.7-.7c.5-.2 1-.1 1.4.3l1.8 1.8Z",{x,y,scale:.42,borderColor:MUTED,fillColor:undefined,borderWidth:stroke});
    return;
  }
  if(type==="calendar"){
    page.drawRectangle({x,y:y+1,width:11,height:9,borderWidth:stroke,borderColor:MUTED});
    page.drawLine({start:{x,y:y+7.5},end:{x:x+11,y:y+7.5},thickness:stroke,color:MUTED});
    page.drawLine({start:{x:x+3,y:y+11},end:{x:x+3,y:y+8},thickness:stroke,color:MUTED});
    page.drawLine({start:{x:x+8,y:y+11},end:{x:x+8,y:y+8},thickness:stroke,color:MUTED});
    return;
  }
  if(type==="total"){
    page.drawCircle({x:x+5.5,y:y+5.5,size:5.2,borderWidth:stroke,borderColor:MUTED});
    page.drawLine({start:{x:x+5.5,y:y+2.2},end:{x:x+5.5,y:y+8.8},thickness:.5,color:MUTED});
    page.drawLine({start:{x:x+3.3,y:y+4},end:{x:x+7.7,y:y+4},thickness:.5,color:MUTED});
    page.drawLine({start:{x:x+3.3,y:y+7},end:{x:x+7.7,y:y+7},thickness:.5,color:MUTED});
    return;
  }
  page.drawRectangle({x,y:y+1,width:9,height:10,borderWidth:stroke,borderColor:MUTED});
  page.drawLine({start:{x:x+6,y:y+11},end:{x:x+9,y:y+8},thickness:stroke,color:MUTED});
  if(type==="person"){
    page.drawCircle({x:x+4.5,y:y+7,size:1.6,borderWidth:.5,borderColor:MUTED});
    page.drawLine({start:{x:x+2.2,y:y+3},end:{x:x+6.8,y:y+3},thickness:.5,color:MUTED});
  }else{
    page.drawLine({start:{x:x+2,y:y+6},end:{x:x+7,y:y+6},thickness:.5,color:MUTED});
    page.drawLine({start:{x:x+2,y:y+3.5},end:{x:x+7,y:y+3.5},thickness:.5,color:MUTED});
  }
}
async function embedLogo(pdf:any,url:string|null|undefined){if(!url)return null;try{const res=await fetch(url,{cache:"no-store"});if(!res.ok)return null;const bytes=new Uint8Array(await res.arrayBuffer());const type=(res.headers.get("content-type")||"").toLowerCase();return type.includes("png")||url.toLowerCase().includes(".png")?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);}catch{return null}}
function addressLines(value:unknown){return (Array.isArray(value)?value.map(safe):[]).filter(Boolean).slice(0,3);}
function contactEmail(org:any){return safe(org?.email)||"framedbyaman@gmail.com";}
function contactPhone(org:any){return safe(org?.phone)||"+91 87095 39814";}

export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;const supabase=await createClient();
  const {data:userData}=await supabase.auth.getUser();if(!userData.user)return new NextResponse("Unauthorized",{status:401});
  const [{data:rawInvoice,error},{data:settings}]=await Promise.all([
    supabase.from("invoices").select("*,clients(*),projects(name),invoice_contents(*),payments(*),organizations(*)").eq("id",id).maybeSingle(),
    supabase.from("workspace_settings").select("*").eq("id",true).maybeSingle()
  ]);
  if(error||!rawInvoice)return new NextResponse("Invoice not found",{status:404});
  const live:any=rawInvoice;
  const issuedVersionNumber=live.issued_version ? Number(live.issued_version) : null;
  const {data:issuedVersion}=issuedVersionNumber
    ? await supabase.from("invoice_versions").select("version_number,snapshot,snapshot_hash").eq("invoice_id",id).eq("version_number",issuedVersionNumber).maybeSingle()
    : {data:null};
  const snapshot:any=issuedVersion?.snapshot;
  const invoice:any=snapshot?.invoice?{...live,...snapshot.invoice,clients:snapshot.client??live.clients,organizations:snapshot.organization??live.organizations,projects:snapshot.project??live.projects,invoice_contents:snapshot.contents??live.invoice_contents,payments:live.payments}:live;
  const client=invoice.clients||{};const org=invoice.organizations||settings||{};const templateKey=getDocumentTemplate(org.invoice_template_key,"invoice")?.key||"legacy_elle";
  const contents=[...(invoice.invoice_contents||[])].sort((a:any,b:any)=>Number(a.position)-Number(b.position));
  const calculatedTotal=contents.reduce((sum:number,item:any)=>sum+(item.priced?Number(item.amount??Number(item.quantity??1)*Number(item.rate??0)):0),0);
  const sourceTotal=Number(invoice.source_total ?? 0);
  const hasAuthoritativeTotal=Number.isFinite(sourceTotal) && sourceTotal > 0;
  const total=hasAuthoritativeTotal ? sourceTotal : calculatedTotal;
  const hasUnpriced=contents.some((item:any)=>!item.priced);
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const regular=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","Geist-Regular.ttf")),{subset:true});
  const bold=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","Geist-SemiBold.ttf")),{subset:true});
  const mono=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","GeistMono-Regular.ttf")),{subset:true});
  const orgLogo=await embedLogo(pdf,org.logo_path);const clientLogo=await embedLogo(pdf,client.logo_path);const W=PAGE.width,L=54,R=W-54;

  const drawFooter=(page:any)=>{
    const email=contactEmail(org),phone=contactPhone(org);
    const showBranding=org.show_minbooks_branding!==false;
    page.drawLine({start:{x:L,y:53},end:{x:R,y:53},thickness:.55,color:LINE});
    text(page,"Thank you for your time and the opportunity to work together.",L,39,bold,8.5);
    icon(page,L,14,"mail");text(page,email,L+18,16,regular,7.5,MUTED);
    icon(page,L+185,14,"phone");text(page,phone,L+203,16,regular,7.5,MUTED);
    if(showBranding)text(page,"MinBooks · Generated from the financial record",R-185,16,regular,6.5,MUTED);
  };

  const drawIdentity=(page:any,continuation=false)=>{
    if(continuation){text(page,String(org.name||org.legal_name||"MinBooks"),L,790,bold,11);right(page,`Invoice #${invoice.invoice_number}`,R,790,mono,8,MUTED);page.drawLine({start:{x:L,y:779},end:{x:R,y:779},thickness:.6,color:LINE});return 760;}
    const top=788;
    if(orgLogo){const d=orgLogo.scale(Math.min(38/orgLogo.width,22/orgLogo.height));page.drawImage(orgLogo,{x:L,y:top-d.height,width:d.width,height:d.height});}
    if(clientLogo){const d=clientLogo.scale(Math.min(34/clientLogo.width,20/clientLogo.height));page.drawImage(clientLogo,{x:R-d.width,y:top-d.height,width:d.width,height:d.height});}
    text(page,"BILLED TO",L,top,bold,7.5,MUTED);text(page,safe(client.legal_name||client.name||"Client"),L,top-19,bold,10.5);
    const addr=addressLines(client.address_lines);addr.forEach((line,i)=>text(page,line,L,top-32-i*10,regular,8.2,MUTED));const infoY=top-32-addr.length*10;
    if(client.pan)text(page,`PAN ${client.pan}`,L,infoY-3,regular,7.8,MUTED);if(client.gstin)text(page,`GST ${client.gstin}`,L,infoY-15,regular,7.8,MUTED);
    const payTop=infoY-43;text(page,"PAY TO",L,payTop,bold,7.5,MUTED);
    const pay=[[`NAME  ${org.payee_name||org.legal_name||org.name||""}`,bold],[`A/C NO  ${org.account_number||""}`,regular],[`BANK  ${org.bank_name||""}`,regular],[`BRANCH  ${org.branch_name||""}`,regular],[`IFSC  ${org.ifsc_code||""}`,regular],[`PAN  ${org.pan||""}`,regular]] as const;
    pay.forEach(([line,font],i)=>text(page,line,L,payTop-18-i*10,font,7.8,i===0?BLACK:MUTED));
    const metaX=370;
    const iconX=metaX-20;
    const valueX=R;
    icon(page,iconX,top-10,"document");text(page,"INVOICE NO",metaX,top,bold,7.5,MUTED);right(page,String(invoice.invoice_number||""),valueX,top-19,mono,12);
    icon(page,iconX,top-63,"calendar");text(page,"DATE",metaX,top-53,bold,7.5,MUTED);right(page,formatDate(invoice.issue_date),valueX,top-72,regular,9);
    icon(page,iconX,top-116,"total");text(page,"GRAND TOTAL",metaX,top-106,bold,7.5,MUTED);right(page,hasAuthoritativeTotal?money(total):(hasUnpriced?"₹X,XXX/-":money(total)),valueX,top-130,bold,16);
    page.drawLine({start:{x:metaX,y:top-143},end:{x:R,y:top-143},thickness:.55,color:LINE});
    if(invoice.due_date){icon(page,iconX,top-168,"calendar");text(page,"DUE",metaX,top-160,bold,7.2,MUTED);right(page,formatDate(invoice.due_date),valueX,top-177,regular,8.5);}
    return Math.min(payTop-84,top-190);
  };

  let page=pdf.addPage([W,PAGE.height]);let y=drawIdentity(page,false);
  const drawTableHeader=()=>{page.drawRectangle({x:L,y:y-25,width:R-L,height:25,color:SOFT});page.drawLine({start:{x:L,y:y-25},end:{x:R,y:y-25},thickness:.55,color:LINE});text(page,"DESCRIPTION",L+10,y-16,bold,7.5,MUTED);right(page,"AMOUNT",R-10,y-16,bold,7.5,MUTED);y-=25;};
  drawTableHeader();
  const projectName=safe(invoice.projects?.name||"");
  const firstTitle=safe(contents[0]?.title||"");
  const duplicateProjectLabel=Boolean(projectName&&(
    projectName.toLowerCase()===firstTitle.toLowerCase() ||
    /^invoice\\s*#?\\s*\\d+/i.test(projectName)
  ));
  if(projectName&&!duplicateProjectLabel){text(page,projectName,L+10,y-17,bold,8.2);y-=29;}else y-=8;
  for(const item of contents){
    const title=safe(item.title||"");const detail=[item.description,item.note].map(safe).filter(Boolean).join(" · ");const lines=wrap(detail?title+" — "+detail:title,regular,350,8.2);const rowH=Math.max(28,Math.min(58,18+lines.length*9));
    if(y-rowH<92){drawFooter(page);page=pdf.addPage([W,PAGE.height]);y=drawIdentity(page,true);drawTableHeader();}
    page.drawLine({start:{x:L,y:y-rowH},end:{x:R,y:y-rowH},thickness:.35,color:LINE});lines.slice(0,4).forEach((lineText,index)=>text(page,lineText,L+10,y-17-index*9,regular,8.2));const amount=item.priced?money(Number(item.amount??Number(item.quantity??1)*Number(item.rate??0))):"₹X,XXX/-";right(page,amount,R-10,y-17,mono,8.5,item.priced?BLACK:MUTED);y-=rowH;
  }
  const totalH=35;if(y-totalH<92){drawFooter(page);page=pdf.addPage([W,PAGE.height]);y=drawIdentity(page,true);drawTableHeader();}
  page.drawRectangle({x:L,y:y-totalH,width:R-L,height:totalH,borderWidth:.65,borderColor:BLACK});text(page,"GRAND TOTAL",L+10,y-22,bold,8.2);right(page,hasAuthoritativeTotal?money(total):(hasUnpriced?"₹X,XXX/-":money(total)),R-10,y-22,bold,11);y-=totalH+25;
  if(invoice.notes){const noteLines=wrap(invoice.notes,regular,R-L,7.8);text(page,"NOTE",L,y,bold,7.2,MUTED);noteLines.slice(0,3).forEach((lineText,i)=>text(page,lineText,L+35,y-i*9,regular,7.8,MUTED));}
  drawFooter(page);

  const bytes=await pdf.save();
  if(issuedVersion){const checksum=createHash("sha256").update(bytes).digest("hex");const versionNumber=Number(issuedVersion.version_number||invoice.issued_version||1);const {data:document}=await supabase.from("documents").select("id").eq("invoice_id",id).eq("document_type","invoice_pdf").eq("version_number",versionNumber).maybeSingle();if(document?.id){const fileName=`INV_${invoice.invoice_number}-${String(org.name||"Invoice").replace(/[^a-z0-9]+/gi,"-")}.pdf`;const filePath=`organizations/${invoice.organization_id}/invoices/${invoice.id}/v${versionNumber}.pdf`;const upload=await supabase.storage.from("finos-documents").upload(filePath,bytes,{contentType:"application/pdf",upsert:true});const stored=!upload.error;const generatedAt=new Date().toISOString();await supabase.from("documents").update({status:stored?"stored":"generated",file_path:stored?filePath:"",file_name:fileName,storage_bucket:"finos-documents",generated_at:generatedAt,checksum_sha256:checksum,source_hash:issuedVersion.snapshot_hash,template_key:templateKey,size_bytes:bytes.length}).eq("id",document.id);await supabase.from("document_versions").upsert({document_id:document.id,version_number:versionNumber,file_path:stored?filePath:null,file_name:fileName,storage_bucket:"finos-documents",mime_type:"application/pdf",size_bytes:bytes.length,checksum_sha256:checksum,generated_at:generatedAt,generated_by:userData.user.id,metadata:{source_hash:issuedVersion.snapshot_hash,template_key:templateKey,storage_error:upload.error?.message??null}},{onConflict:"document_id,version_number"});}}
  return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="INV_${invoice.invoice_number}-${String(org.name||"Invoice").replace(/[^a-z0-9]+/gi,"-")}.pdf"`,"Cache-Control":"private, no-store"}});
}
