import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const A4:[number,number]=[595.2756,841.8898],BLACK=rgb(.08,.08,.08),MUTED=rgb(.38,.38,.38),LINE=rgb(.78,.78,.78),SOFT=rgb(.96,.96,.95);
export type StatementLedgerRow={transaction_date:string;transaction_type:string;reference:string;debit:number;credit:number;running_balance:number};
export type StatementPdfContext={organization:Record<string,unknown>;client:Record<string,unknown>;periodLabel:string;periodStart:string;periodEnd:string;rows:StatementLedgerRow[];openingBalance:number};
const safe=(v:unknown)=>String(v??"").replace(/[\r\n\t]+/g," ").trim();
const money=(v:number)=>`₹${Math.round(v||0).toLocaleString("en-IN")}`;
const date=(v:string)=>new Date(v+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
function text(p:any,v:string,x:number,y:number,f:any,s=8,c=BLACK){p.drawText(safe(v),{x,y,font:f,size:s,color:c});}
function right(p:any,v:string,x:number,y:number,f:any,s=8,c=BLACK){const q=safe(v);p.drawText(q,{x:x-f.widthOfTextAtSize(q,s),y,font:f,size:s,color:c});}
async function logo(pdf:any,url:any){if(!url)return null;try{const r=await fetch(String(url),{cache:"no-store"});if(!r.ok)return null;const b=new Uint8Array(await r.arrayBuffer());const t=(r.headers.get("content-type")||"").toLowerCase();return t.includes("png")||String(url).toLowerCase().includes(".png")?await pdf.embedPng(b):await pdf.embedJpg(b);}catch{return null}}

export async function renderStatementPdf(context:StatementPdfContext){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const regular=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","Geist-Regular.ttf")),{subset:true});
 const bold=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","Geist-SemiBold.ttf")),{subset:true});
 const mono=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","GeistMono-Regular.ttf")),{subset:true});
 const [W,H]=A4,L=54,R=W-54;const org=context.organization as any,client=context.client as any;const orgLogo=await logo(pdf,org.logo_path);
 const pages:any[]=[];let page:any=null,y=0;
 const footer=(p:any)=>{p.drawLine({start:{x:L,y:53},end:{x:R,y:53},thickness:.55,color:LINE});text(p,"Thank you for your time.",L,39,bold,8.5);text(p,safe(org.email||"framedbyaman@gmail.com"),L+98,39,regular,7.5,MUTED);text(p,safe(org.phone||"+91 87095 39814"),R-115,39,regular,7.5,MUTED);};
 const header=(continuation=false)=>{page=pdf.addPage(A4);pages.push(page);if(continuation){text(page,safe(org.name||org.legal_name||"MinBooks"),L,790,bold,11);right(page,context.periodLabel,R,790,bold,8,MUTED);page.drawLine({start:{x:L,y:779},end:{x:R,y:779},thickness:.55,color:LINE});y=758;return;}if(orgLogo){const d=orgLogo.scale(Math.min(38/orgLogo.width,22/orgLogo.height));page.drawImage(orgLogo,{x:L,y:790-d.height,width:d.width,height:d.height});}text(page,"ACCOUNT STATEMENT",L,790,bold,7.5,MUTED);text(page,safe(org.name||org.legal_name||"MinBooks"),L,768,bold,13);right(page,context.periodLabel,R,790,bold,8,MUTED);right(page,date(context.periodEnd),R,768,regular,8);page.drawLine({start:{x:L,y:751},end:{x:R,y:751},thickness:.65,color:LINE});text(page,safe(client.legal_name||client.name||"Client"),L,723,bold,11);const addr=Array.isArray(client.address_lines)?client.address_lines.map(safe).filter(Boolean).slice(0,3):[];addr.forEach((v:string,i:number)=>text(page,v,L,707-i*10,7.8,regular,MUTED));y=707-addr.length*10-28;};
 const table=()=>{page.drawRectangle({x:L,y:y-25,width:R-L,height:25,color:SOFT});text(page,"DATE",L+8,y-16,bold,7,MUTED);text(page,"ENTRY",L+92,y-16,bold,7,MUTED);text(page,"REFERENCE",L+185,y-16,bold,7,MUTED);right(page,"DEBIT",R-135,y-16,bold,7,MUTED);right(page,"CREDIT",R-70,y-16,bold,7,MUTED);right(page,"BALANCE",R-8,y-16,bold,7,MUTED);y-=25;};
 header(false);
 const billed=context.rows.reduce((s,r)=>s+Number(r.debit||0),0),paid=context.rows.reduce((s,r)=>s+Number(r.credit||0),0),closing=context.openingBalance+billed-paid;
 [["OPENING",context.openingBalance],["BILLED",billed],["PAID",paid],["CLOSING",closing]].forEach(([label,value],i)=>{const x=L+i*122;page.drawRectangle({x,y:y-43,width:112,height:43,borderWidth:.5,borderColor:LINE});text(page,String(label),x+8,y-17,bold,6.5,MUTED);right(page,money(Number(value)),x+104,y-34,mono,9);});y-=60;table();
 for(const row of context.rows){if(y<92){footer(page);header(true);table();}text(page,date(row.transaction_date),L+8,y,regular,7.2);text(page,row.transaction_type==="invoice"?"Invoice":"Payment",L+92,y,bold,7.2);text(page,row.reference,L+185,y,regular,7.2);right(page,row.debit?money(Number(row.debit)):"—",R-135,y,mono,7.2);right(page,row.credit?money(Number(row.credit)):"—",R-70,y,mono,7.2);right(page,money(Number(row.running_balance)),R-8,y,mono,7.2);page.drawLine({start:{x:L,y:y-8},end:{x:R,y:y-8},thickness:.25,color:LINE});y-=19;}
 if(!context.rows.length)text(page,"No transactions in this period.",L,y,regular,8,MUTED);
 footer(page);return pdf.save();
}
