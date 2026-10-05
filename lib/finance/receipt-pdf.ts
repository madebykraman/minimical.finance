import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const W=595.2756,H=841.8898,L=54,R=W-54;
const BLACK=rgb(.08,.08,.08),MUTED=rgb(.38,.38,.38),LINE=rgb(.78,.78,.78),SOFT=rgb(.96,.96,.95);

const safe=(value:unknown)=>String(value??"").replace(/[\r\n\t]+/g," ").trim();
const money=(value:number)=>`₹${Math.round(value||0).toLocaleString("en-IN")}/-`;
const dateLabel=(value?:string|null)=>{
  if(!value)return "—";
  const d=new Date(value+"T00:00:00");
  return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
};
function text(page:any,value:string,x:number,y:number,font:any,size=9,color=BLACK){page.drawText(safe(value),{x,y,font,size,color});}
function right(page:any,value:string,x:number,y:number,font:any,size=9,color=BLACK){const v=safe(value);page.drawText(v,{x:x-font.widthOfTextAtSize(v,size),y,font,size,color});}
function icon(page:any,x:number,y:number,type:"person"|"mail"|"phone"){
  if(type==="mail"){page.drawRectangle({x,y,width:9,height:6,borderWidth:.55,borderColor:MUTED});page.drawLine({start:{x,y:y+6},end:{x:x+4.5,y:y+2.5},thickness:.45,color:MUTED});page.drawLine({start:{x:x+9,y:y+6},end:{x:x+4.5,y:y+2.5},thickness:.45,color:MUTED});return;}
  if(type==="phone"){page.drawCircle({x:x+4.5,y:y+4.5,size:4.5,borderWidth:.55,borderColor:MUTED});return;}
  page.drawRectangle({x,y,width:8,height:9,borderWidth:.55,borderColor:MUTED});page.drawCircle({x:x+4,y:y+6.2,size:1.7,borderWidth:.45,borderColor:MUTED});
}
async function embedLogo(pdf:any,url:string|null|undefined){
  if(!url)return null;
  try{
    const response=await fetch(url,{cache:"no-store"});
    if(!response.ok)return null;
    const bytes=new Uint8Array(await response.arrayBuffer());
    const type=(response.headers.get("content-type")||"").toLowerCase();
    return type.includes("png")||url.toLowerCase().includes(".png")?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
  }catch{return null;}
}

export type ReceiptPdfInput={
  organization:any;
  client:any;
  invoiceNumber:string;
  invoiceTotal:number;
  payment:{
    amount:number;
    payment_date?:string|null;
    method?:string|null;
    reference?:string|null;
    receipt_number?:string|null;
    notes?:string|null;
  };
};

export async function renderReceiptPdf(input:ReceiptPdfInput){
  const {organization:org,client,payment}=input;
  const pdf=await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regularBytes,boldBytes,monoBytes,orgLogo,clientLogo]=await Promise.all([
    readFile(join(process.cwd(),"public","fonts","Geist-Regular.ttf")),
    readFile(join(process.cwd(),"public","fonts","Geist-SemiBold.ttf")),
    readFile(join(process.cwd(),"public","fonts","GeistMono-Regular.ttf")),
    embedLogo(pdf,org?.logo_path),
    embedLogo(pdf,client?.logo_path),
  ]);
  const regular=await pdf.embedFont(regularBytes,{subset:true});
  const bold=await pdf.embedFont(boldBytes,{subset:true});
  const mono=await pdf.embedFont(monoBytes,{subset:true});
  const page=pdf.addPage([W,H]);

  if(orgLogo){const d=orgLogo.scale(Math.min(40/orgLogo.width,22/orgLogo.height));page.drawImage(orgLogo,{x:L,y:788-d.height,width:d.width,height:d.height});}
  if(clientLogo){const d=clientLogo.scale(Math.min(34/clientLogo.width,20/clientLogo.height));page.drawImage(clientLogo,{x:R-d.width,y:788-d.height,width:d.width,height:d.height});}

  text(page,"PAYMENT RECEIPT",L,788,bold,7.5,MUTED);
  text(page,safe(org?.name||org?.legal_name||"Organisation"),L,766,bold,13);
  right(page,`RECEIPT ${safe(payment.receipt_number||"")}`,R,788,mono,9);
  right(page,dateLabel(payment.payment_date),R,766,regular,9);
  page.drawLine({start:{x:L,y:749},end:{x:R,y:749},thickness:.65,color:LINE});

  text(page,"RECEIVED FROM",L,721,bold,7.5,MUTED);
  icon(page,L-12,720,"person");
  text(page,safe(client?.legal_name||client?.name||"Client"),L,700,bold,11);
  if(client?.email)text(page,safe(client.email),L,685,regular,8,MUTED);

  page.drawRectangle({x:L,y:602,width:R-L,height:62,color:SOFT});
  text(page,"AMOUNT RECEIVED",L+14,643,bold,7.5,MUTED);
  text(page,money(Number(payment.amount||0)),L+14,616,mono,19);

  text(page,"PAYMENT DETAILS",L,567,bold,7.5,MUTED);
  page.drawLine({start:{x:L,y:556},end:{x:R,y:556},thickness:.55,color:LINE});
  const facts=[
    ["INVOICE",input.invoiceNumber?`#${safe(input.invoiceNumber)}`:"—"],
    ["PAYMENT DATE",dateLabel(payment.payment_date)],
    ["METHOD",String(payment.method||"").replaceAll("_"," ").toUpperCase()||"—"],
    ["REFERENCE",payment.reference||"—"],
    ["INVOICE TOTAL",money(Number(input.invoiceTotal||0))],
  ];
  facts.forEach(([label,value],index)=>{const y=532-index*27;text(page,label,L,y,bold,7.2,MUTED);text(page,String(value),L+112,y,regular,8.5);});

  page.drawRectangle({x:L,y:335,width:R-L,height:62,borderWidth:.55,borderColor:LINE});
  text(page,"RECORD",L+12,375,bold,7.2,MUTED);
  text(page,"This receipt records the payment captured against the invoice above.",L+12,355,regular,8.2);
  if(payment.notes)text(page,safe(payment.notes),L+12,340,regular,7.5,MUTED);

  page.drawLine({start:{x:L,y:53},end:{x:R,y:53},thickness:.55,color:LINE});
  text(page,safe(org?.invoice_footer_line_2)||"Thank you for your time.",L,39,regular,8.5);
  const email=safe(org?.email),phone=safe(org?.phone);
  if(email){icon(page,L,19,"mail");text(page,email,L+14,19,regular,7.5,MUTED);}
  if(phone){const phoneX=email?L+185:L;icon(page,phoneX,19,"phone");text(page,phone,phoneX+14,19,regular,7.5,MUTED);}

  return pdf.save();
}
