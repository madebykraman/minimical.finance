import {PDFDocument,StandardFonts,rgb,type PDFFont,type PDFPage} from "pdf-lib";
import type {InvoiceGroup} from "@/lib/tracker";
export type BillingParty={name:string;legal_name?:string|null;email?:string|null;address?:string|null;gstin?:string|null;bank_name?:string|null;bank_account?:string|null;bank_ifsc?:string|null;invoice_footer?:string|null};
export type BillTo={name:string;email?:string|null;address?:string|null;gstin?:string|null}|null;
const cobalt=rgb(.14,.34,.83),ink=rgb(.11,.16,.25),muted=rgb(.43,.50,.60),rule=rgb(.87,.90,.94);
const txt=(v:unknown)=>String(v??"").replace(/[’‘]/g,"'").replace(/[–—]/g,"-").replace(/×/g,"x").replace(/₹/g,"INR ").replace(/\r?\n/g," ").replace(/[^\x20-\x7e]/g,"?").replace(/\s+/g," ").trim();
const currency=(n:number)=>"INR "+Number(n).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
function lines(text:unknown,font:PDFFont,size:number,width:number){
 const words=txt(text).split(" "),result:string[]=[];let line="";
 for(let word of words){
  if(!word)continue;
  while(font.widthOfTextAtSize(word,size)>width){
   let n=1;while(n<word.length&&font.widthOfTextAtSize(word.slice(0,n+1),size)<width)n++;
   if(line){result.push(line);line=""}
   result.push(word.slice(0,n));word=word.slice(n);
  }
  const candidate=line?line+" "+word:word;
  if(font.widthOfTextAtSize(candidate,size)<=width)line=candidate;
  else{if(line)result.push(line);line=word}
 }
 if(line)result.push(line);
 return result.length?result:[""];
}
export async function renderInvoicePdf({organization,client,invoice}:{organization:BillingParty;client:BillTo;invoice:InvoiceGroup}):Promise<Uint8Array>{
 if(!invoice.number||!invoice.rows.length||!Number.isFinite(invoice.total)||invoice.total<0)
  throw new Error("Invoice cannot be rendered: invalid ledger.");
 const pdf=await PDFDocument.create();pdf.setTitle(txt("Invoice "+invoice.number+" - "+organization.name));
 pdf.setAuthor(txt(organization.legal_name||organization.name));
 const roman=await pdf.embedFont(StandardFonts.Helvetica);
 const semibold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const margin=44,w=595-2*margin,top=793,bottom=95;
 let page:PDFPage;let y=top;const pages:PDFPage[]=[];
 const draw=(v:unknown,x:number,pos:number,size=10,bold=false,color=ink)=>{
  page.drawText(txt(v),{x,y:pos,size,font:bold?semibold:roman,color});
 };
 const right=(v:unknown,x:number,pos:number,size=10,bold=false,color=ink)=>{
  const content=txt(v),font=bold?semibold:roman;
  draw(content,Math.max(margin,x-font.widthOfTextAtSize(content,size)),pos,size,bold,color);
 };
 const horizontal=(at:number)=>page.drawLine({start:{x:margin,y:at},end:{x:margin+w,y:at},thickness:.7,color:rule});
 const next=()=>{
  page=pdf.addPage([595,842]);pages.push(page);y=top;
  page.drawRectangle({x:0,y:806,width:595,height:36,color:cobalt});
  draw("FINANCE   /   INVOICE",margin,819,10,true,rgb(1,1,1));
  right("#"+invoice.number,margin+w,819,10,true,rgb(1,1,1));
  y-=33;
 };
 const section=(label:string)=>{
  if(y<bottom+36)next();
  draw(label,margin,y,9,true,cobalt);y-=20;
 };
 const message=(value:unknown,width=w,fontSize=9)=>{
  for(const line of lines(value,roman,fontSize,width)){
   if(y<bottom+15)next();
   draw(line,margin,y,fontSize,false,muted);y-=14;
  }
 };
 next();
 const company=organization.legal_name||organization.name;
 // The header is a generated copy; no fictitious contact, tax or payment fields.
 for(const part of lines(company,semibold,22,w)){draw(part,margin,y,22,true);y-=26}
 if(organization.address)message(organization.address);
 if(organization.email)message(organization.email);
 if(organization.gstin)message("GSTIN: "+organization.gstin);
 y-=9;horizontal(y);y-=26;
 const headerY=y;
 draw("BILL TO",margin,y,9,true,cobalt);
 draw("DETAILS",321,y,9,true,cobalt);y-=18;
 for(const part of lines(client?.name||"Client not assigned",semibold,12,242)){draw(part,margin,y,12,true);y-=16}
 if(client?.address){for(const part of lines(client.address,roman,9,245).slice(0,5)){draw(part,margin,y,9,false,muted);y-=13}}
 if(client?.email){draw(lines(client.email,roman,9,245)[0],margin,y,9,false,muted);y-=14}
 if(client?.gstin){draw(lines("GSTIN: "+client.gstin,roman,9,245)[0],margin,y,9,false,muted);y-=14}
 const headerInfo=[["Number","#"+invoice.number],["Issued",invoice.date||"Not supplied"],["Due",invoice.dueDate||"Not supplied"],["Status",invoice.sourceStatus==="Draft"?"DRAFT":invoice.balance<=0?"Paid":invoice.paid>0?"Part paid":"Unpaid"]];
 headerInfo.forEach(([label,value],i)=>{draw(label,321,headerY-18-i*18,9,false,muted);right(value,margin+w,headerY-18-i*18,9,true)});
 y=Math.min(y,headerY-98)-13;
 const rowHeader=()=>{
  if(y<bottom+65)next();
  page.drawRectangle({x:margin,y:y-20,width:w,height:28,color:rgb(.944,.958,.985)});
  draw("DESCRIPTION",margin+10,y-10,9,true,muted);
  right("AMOUNT",margin+w-10,y-10,9,true,muted);y-=38;
 };
 rowHeader();
 for(const item of invoice.rows){
  const name=txt(item.project_name.replace(/^Elle India_/i,"").replaceAll("_"," "));
  const itemLines=lines(name,roman,10,350);
  const note=item.unit_price!=null?"Qty "+Number(item.quantity||1)+" x "+currency(Number(item.unit_price)):(item.assigned_by?"POC: "+txt(item.assigned_by):"");
  const height=Math.max(40,itemLines.length*14+(note?24:10));
  if(y-height<bottom+42){next();rowHeader()}
  const rowY=y;
  itemLines.forEach((line,i)=>draw(line,margin+8,rowY-i*14,10));
  if(note)draw(lines(note,roman,8,350)[0],margin+8,rowY-itemLines.length*14-1,8,false,muted);
  right(item.amount==null?"Not priced":currency(Number(item.amount)),margin+w-8,rowY,10,true);
  y-=height;horizontal(y+8);y-=9;
 }
 if(y<bottom+154)next();
 y-=17;
 right("Subtotal",margin+w-185,y,10,false,muted);
 right(currency(invoice.lineTotal),margin+w,y,10,true);y-=24;
 if(invoice.taxAmount>0){right("Tax ("+invoice.taxRate+"%)",margin+w-185,y,10,false,muted);right(currency(invoice.taxAmount),margin+w,y,10,true);y-=24}
 horizontal(y+9);
 right("INVOICE TOTAL",margin+w-185,y-13,11,true);
 right(currency(invoice.total),margin+w,y-13,15,true,cobalt);y-=43;
 right("Paid / settled",margin+w-185,y,9,false,muted);
 right(currency(invoice.paid),margin+w,y,10,true);y-=24;
 right("BALANCE DUE",margin+w-185,y-5,11,true);
 right(currency(invoice.balance),margin+w,y-5,15,true,cobalt);y-=44;
 if(Math.abs(invoice.discrepancy)>.009){
  section("RECONCILIATION NOTE");
  message("Recorded invoice total differs from the sum of work items and tax. Both original values are shown.",w,9);
  y-=10;
 }
 if(invoice.publicNotes){section("NOTES");message(invoice.publicNotes);y-=9}
 if(organization.bank_name||organization.bank_account||organization.bank_ifsc){
  section("BANK DETAILS");
  if(organization.bank_name)message("Bank: "+organization.bank_name);
  if(organization.bank_account)message("Account: "+organization.bank_account);
  if(organization.bank_ifsc)message("IFSC: "+organization.bank_ifsc);
 }
 if(organization.invoice_footer){section("INVOICE FOOTER");message(organization.invoice_footer)}
 const generatedNote=invoice.document?
  "Generated from the current ledger; source record references "+txt(invoice.document)+". This is not the original uploaded document.":
  "Generated from the current finance records. Review before external issuance.";
 const noteLines=lines(generatedNote,roman,7.5,w);
 pages.forEach((pg,i)=>{
  page=pg;
  horizontal(77);
  noteLines.slice(0,2).forEach((line,k)=>draw(line,margin,65-10*k,7.5,false,muted));
  right((i+1)+" / "+pages.length,margin+w,39,8,false,muted);
 });
 return pdf.save();
}
