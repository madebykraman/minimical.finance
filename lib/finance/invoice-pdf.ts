import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PAGE={width:595.2756,height:841.8898};
const BLACK=rgb(0,0,0);
const SOFT_BLACK=rgb(.08,.08,.08);
const MUTED=rgb(.38,.38,.38);
const LINE=rgb(.78,.78,.78);
const SOFT=rgb(.96,.96,.95);

export type InvoicePdfInput={
  invoice:any;
  organization:any;
  client:any;
  projectName?:string|null;
  contents:any[];
  templateKey?:string|null;
};

const safe=(value:unknown)=>String(value??"").replace(/[\r\n\t]+/g," ").trim();
const money=(value:number)=>`₹${Math.round(value||0).toLocaleString("en-IN")}/-`;
const unknown="₹X,XXX/-";
const formatDate=(value?:string|null)=>{
  if(!value)return "";
  const d=new Date(value+"T00:00:00");
  if(Number.isNaN(d.getTime()))return String(value);
  return d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
};
const formatLongDate=(value?:string|null)=>{
  if(!value)return "";
  const d=new Date(value+"T00:00:00");
  if(Number.isNaN(d.getTime()))return String(value);
  const day=d.getDate();
  const suffix=day%100>=11&&day%100<=13?"th":day%10===1?"st":day%10===2?"nd":day%10===3?"rd":"th";
  return `${day}${suffix} ${d.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}`;
};
const wrapAt=(textValue:string,font:any,maxWidth:number,size:number)=>{
  const out:string[]=[];let current="";
  for(const word of safe(textValue).split(/\s+/).filter(Boolean)){
    const next=current?`${current} ${word}`:word;
    if(!current||font.widthOfTextAtSize(next,size)<=maxWidth)current=next;
    else{out.push(current);current=word;}
  }
  if(current)out.push(current);
  return out;
};
const fitItem=(textValue:string,font:any,maxWidth:number)=>{
  for(let size=9.8;size>=6;size-=.5){
    const lines=wrapAt(textValue,font,maxWidth,size);
    if(lines.length<=4)return {lines,size,leading:Math.max(8,size+2)};
  }
  return {lines:wrapAt(textValue,font,maxWidth,6).slice(0,5),size:6,leading:8};
};
async function embedLogo(pdf:any,url:string|null|undefined){
  if(!url)return null;
  try{
    const response=await fetch(url,{cache:"no-store"});
    if(!response.ok)return null;
    const bytes=new Uint8Array(await response.arrayBuffer());
    const type=(response.headers.get("content-type")||"").toLowerCase();
    if(type.includes("png")||url.toLowerCase().includes(".png"))return await pdf.embedPng(bytes);
    if(type.includes("jpeg")||type.includes("jpg")||/\.jpe?g($|\?)/i.test(url))return await pdf.embedJpg(bytes);
    return null;
  }catch{return null;}
}
const addressLines=(value:unknown)=>(Array.isArray(value)?value.map(safe):[]).filter(Boolean).slice(0,4);
const itemAmount=(item:any)=>item.priced?Number(item.amount??Number(item.quantity??1)*Number(item.rate??0)):0;
const itemLabel=(item:any)=>{
  const title=safe(item.title||"");
  const detail=[item.description,item.note].map(safe).filter(Boolean).join(" · ");
  return detail?`${title} — ${detail}`:title;
};
function financials(invoice:any,contents:any[]){
  const calculatedTotal=contents.reduce((sum,item)=>sum+itemAmount(item),0);
  const sourceTotal=Number(invoice.source_total??0);
  const hasAuthoritativeTotal=Number.isFinite(sourceTotal)&&sourceTotal>0;
  return {calculatedTotal,sourceTotal,hasAuthoritativeTotal,total:hasAuthoritativeTotal?sourceTotal:calculatedTotal,hasUnpriced:contents.some(item=>!item.priced)};
}
async function assets(pdf:any,organization:any,client:any){
  pdf.registerFontkit(fontkit);
  const [regularBytes,boldBytes,monoBytes,orgLogo,clientLogo]=await Promise.all([
    readFile(join(process.cwd(),"public","fonts","Geist-Regular.ttf")),
    readFile(join(process.cwd(),"public","fonts","Geist-SemiBold.ttf")),
    readFile(join(process.cwd(),"public","fonts","GeistMono-Regular.ttf")),
    embedLogo(pdf,organization?.logo_path),
    embedLogo(pdf,client?.logo_path),
  ]);
  const regular=await pdf.embedFont(regularBytes,{subset:true});
  const bold=await pdf.embedFont(boldBytes,{subset:true});
  const mono=await pdf.embedFont(monoBytes,{subset:true});
  return {regular,bold,mono,orgLogo,clientLogo};
}

function paginateItems(items:any[],font:any,maxWidth:number,availableHeight:number,minGap=10){
  const pages:any[][]=[];let current:any[]=[];let used=0;
  for(const item of items){
    const fitted=fitItem(itemLabel(item),font,maxWidth);
    const height=Math.max(12,fitted.lines.length*fitted.leading);
    const extra=current.length?minGap:0;
    if(current.length&&used+extra+height>availableHeight){pages.push(current);current=[];used=0;}
    current.push({...item,__fit:fitted,__height:height});
    used+=(current.length>1?minGap:0)+height;
  }
  if(current.length)pages.push(current);
  return pages.length?pages:[[]];
}

async function renderLegacy(input:InvoicePdfInput){
  const {invoice,organization:org,client}=input;
  const contents=[...(input.contents||[])].sort((a,b)=>Number(a.position??0)-Number(b.position??0));
  const projectName=safe(input.projectName||"");
  const {total,hasAuthoritativeTotal,hasUnpriced}=financials(invoice,contents);
  const pdf=await PDFDocument.create();
  const {regular,bold,mono,orgLogo,clientLogo}=await assets(pdf,org,client);
  const X={left:62.42,right:536.6,divider:419.3,metaRight:520.2,descriptionCenter:240.86,amountCenter:477.95};
  const Y={billedLabel:772.46,billedFirst:756.65,payLabel:671.4,payFirst:655.58,invoiceLabel:772.46,invoiceNumber:756.65,dateLabel:721.49,dateValue:706.55,tableTop:538.7,tableHeader:511.46,tableTotal:148.52,tableBottom:125.67,totalBaseline:133.65,footer1:57.12,footer2:42.18};
  const leading=11.8;
  const drawText=(page:any,value:string,x:number,y:number,font:any=regular,size=9.8)=>page.drawText(safe(value),{x,y,size,font,color:BLACK});
  const centered=(page:any,value:string,x:number,y:number,font:any=regular,size=9.8)=>{const v=safe(value);drawText(page,v,x-font.widthOfTextAtSize(v,size)/2,y,font,size);};
  const right=(page:any,value:string,x:number,y:number,font:any=regular,size=9.8)=>{const v=safe(value);drawText(page,v,x-font.widthOfTextAtSize(v,size),y,font,size);};
  const docIcon=(page:any,x:number,y:number,s=8)=>{page.drawRectangle({x,y,width:s,height:s,borderColor:BLACK,borderWidth:.5});page.drawLine({start:{x:x+2,y:y+5.5},end:{x:x+6,y:y+5.5},thickness:.45,color:BLACK});page.drawLine({start:{x:x+2,y:y+3},end:{x:x+5.5,y:y+3},thickness:.45,color:BLACK});};
  const drawFooter=(page:any)=>{
    const footer1=safe(org?.invoice_footer_line_1)||(org?.email?`Please contact ${safe(org.email)} in case of any queries.`:"");
    if(footer1)drawText(page,footer1,X.left,Y.footer1,regular,9.4);
    drawText(page,safe(org?.invoice_footer_line_2)||"Thank you for your time.",X.left,Y.footer2,regular,9.4);
    if(org?.show_minbooks_branding===true)right(page,"MinBooks",X.right,Y.footer2,regular,6.5);
  };
  const drawFirstIdentity=(page:any)=>{
    if(orgLogo){const d=orgLogo.scale(Math.min(48/orgLogo.width,24/orgLogo.height));page.drawImage(orgLogo,{x:X.left,y:794-d.height,width:d.width,height:d.height});}
    if(clientLogo){const d=clientLogo.scale(Math.min(48/clientLogo.width,24/clientLogo.height));page.drawImage(clientLogo,{x:X.right-d.width,y:794-d.height,width:d.width,height:d.height});}
    docIcon(page,X.left-14,Y.billedLabel-1,8);drawText(page,"BILLED TO:",X.left,Y.billedLabel,bold);
    const billed=[client?.legal_name||client?.name,...addressLines(client?.address_lines),client?.pan?`PAN No. ${client.pan}`:"",client?.gstin?`GSTIN: ${client.gstin}`:""].filter(Boolean);
    billed.forEach((line:string,index:number)=>drawText(page,line,X.left,Y.billedFirst-index*leading));
    docIcon(page,X.left-14,Y.payLabel-1,8);drawText(page,"PAY TO:",X.left,Y.payLabel,bold);
    const pay=[`NAME: ${org?.payee_name||org?.legal_name||org?.name||""}`,org?.account_number?`A/C NO. ${org.account_number}`:"",org?.bank_name?`BANK: ${org.bank_name}`:"",org?.branch_name?`BRANCH: ${org.branch_name}`:"",org?.branch_code?`BRANCH CODE: ${org.branch_code}`:"",org?.ifsc_code?`IFSC CODE: ${org.ifsc_code}`:"",org?.pan?`PAN NO. ${org.pan}`:""].filter(Boolean);
    pay.forEach((line:string,index:number)=>drawText(page,line,X.left,Y.payFirst-index*leading));
    right(page,"INVOICE NO.",X.metaRight,Y.invoiceLabel,bold);right(page,String(invoice.invoice_number||""),X.metaRight,Y.invoiceNumber);
    right(page,"DATE:",X.metaRight,Y.dateLabel,bold);right(page,formatLongDate(invoice.issue_date),X.metaRight,Y.dateValue);
  };
  const drawContinuationIdentity=(page:any,pageNumber:number)=>{
    drawText(page,safe(org?.name||org?.legal_name||"Organisation"),X.left,790,bold,10.5);
    right(page,`Invoice #${safe(invoice.invoice_number)} · page ${pageNumber}`,X.right,790,mono,8);
    page.drawLine({start:{x:X.left,y:778},end:{x:X.right,y:778},thickness:.55,color:BLACK});
  };
  const drawTableFrame=(page:any,top:number,header:number,totalLine:number,bottom:number)=>{
    const line={thickness:.62,color:BLACK};
    page.drawRectangle({x:X.left,y:bottom,width:X.right-X.left,height:top-bottom,borderWidth:.62,borderColor:BLACK});
    page.drawLine({start:{x:X.divider,y:bottom},end:{x:X.divider,y:top},...line});
    page.drawLine({start:{x:X.left,y:header},end:{x:X.right,y:header},...line});
    page.drawLine({start:{x:X.left,y:totalLine},end:{x:X.right,y:totalLine},...line});
    centered(page,"DESCRIPTION",X.descriptionCenter,top-17,bold);centered(page,"AMOUNT",X.amountCenter,top-17,bold);
  };
  const drawBodyItems=(page:any,items:any[],bodyTop:number,bodyBottom:number,showProject:boolean)=>{
    let top=bodyTop;
    if(showProject&&projectName){centered(page,projectName,X.descriptionCenter,top,bold,8.2);top-=24;}
    if(!items.length)return;
    const required=items.reduce((sum,item)=>sum+item.__height,0);
    const room=Math.max(0,top-bodyBottom);
    const gap=items.length>1?Math.min(43,Math.max(8,(room-required)/(items.length-1))):0;
    const span=required+gap*Math.max(0,items.length-1);
    let cursor=top-Math.max(0,(room-span)/2);
    for(const item of items){
      const fit=item.__fit||fitItem(itemLabel(item),regular,245);
      const height=item.__height||Math.max(12,fit.lines.length*fit.leading);
      const centerY=cursor-height/2;
      const first=centerY+((fit.lines.length-1)*fit.leading)/2;
      fit.lines.forEach((line:string,index:number)=>centered(page,line,X.descriptionCenter,first-index*fit.leading,regular,fit.size));
      centered(page,item.priced?money(itemAmount(item)):unknown,X.amountCenter,centerY,mono,Math.min(9.8,fit.size+.2));
      cursor-=height+gap;
    }
  };

  const firstBodyTop=Y.tableHeader-26;
  const firstBodyBottom=Y.tableTotal+22;
  const projectReserve=projectName?24:0;
  const firstPages=paginateItems(contents,regular,245,(firstBodyTop-firstBodyBottom)-projectReserve,9);
  const firstItems=firstPages.shift()||[];
  let page=pdf.addPage([PAGE.width,PAGE.height]);
  drawFirstIdentity(page);
  drawTableFrame(page,Y.tableTop,Y.tableHeader,Y.tableTotal,Y.tableBottom);
  drawBodyItems(page,firstItems,firstBodyTop,firstBodyBottom,true);
  const firstIsFinal=firstPages.length===0;
  centered(page,firstIsFinal?"TOTAL":"CONTINUED",X.descriptionCenter,Y.totalBaseline,bold);
  centered(page,firstIsFinal?(hasAuthoritativeTotal?money(total):(hasUnpriced?unknown:money(total))):"→",X.amountCenter,Y.totalBaseline,mono);
  drawFooter(page);

  let pageNumber=2;
  const continuationTop=748,continuationHeader=720,continuationTotal=122,continuationBottom=98;
  const continuationBodyTop=continuationHeader-25,continuationBodyBottom=continuationTotal+22;
  const remaining=firstPages.flatMap(items=>items.map(({__fit,__height,...item}:any)=>item));
  const continuationPages=paginateItems(remaining,regular,245,continuationBodyTop-continuationBodyBottom,9);
  for(let index=0;index<continuationPages.length&&remaining.length;index++){
    const items=continuationPages[index];
    page=pdf.addPage([PAGE.width,PAGE.height]);
    drawContinuationIdentity(page,pageNumber++);
    drawTableFrame(page,continuationTop,continuationHeader,continuationTotal,continuationBottom);
    drawBodyItems(page,items,continuationBodyTop,continuationBodyBottom,false);
    const isFinal=index===continuationPages.length-1;
    centered(page,isFinal?"TOTAL":"CONTINUED",X.descriptionCenter,continuationTotal-15,bold);
    centered(page,isFinal?(hasAuthoritativeTotal?money(total):(hasUnpriced?unknown:money(total))):"→",X.amountCenter,continuationTotal-15,mono);
    drawFooter(page);
  }
  return pdf.save();
}

function cleanIcon(page:any,x:number,y:number,type:"document"|"mail"|"phone"|"calendar"|"total"){
  const stroke=.65;
  if(type==="mail"){page.drawRectangle({x,y:y+1,width:11,height:7,borderWidth:stroke,borderColor:MUTED});page.drawLine({start:{x,y:y+8},end:{x:x+5.5,y:y+4.3},thickness:stroke,color:MUTED});page.drawLine({start:{x:x+11,y:y+8},end:{x:x+5.5,y:y+4.3},thickness:stroke,color:MUTED});return;}
  if(type==="phone"){page.drawSvgPath("M20.4 15.1c-1.2 1.2-2.6 2-4.1 2.4-3.5-1.7-6.2-4.4-7.9-7.9.4-1.5 1.2-2.9 2.4-4.1l1.8 1.8c.4.4.5.9.3 1.4l-.7 1.7c1.2 2 2.9 3.7 4.9 4.9l1.7-.7c.5-.2 1-.1 1.4.3l1.8 1.8Z",{x,y,scale:.42,borderColor:MUTED,borderWidth:stroke});return;}
  if(type==="calendar"){page.drawRectangle({x,y:y+1,width:11,height:9,borderWidth:stroke,borderColor:MUTED});page.drawLine({start:{x,y:y+7.5},end:{x:x+11,y:y+7.5},thickness:stroke,color:MUTED});return;}
  if(type==="total"){page.drawCircle({x:x+5.5,y:y+5.5,size:5.2,borderWidth:stroke,borderColor:MUTED});return;}
  page.drawRectangle({x,y:y+1,width:9,height:10,borderWidth:stroke,borderColor:MUTED});page.drawLine({start:{x:x+2,y:y+6},end:{x:x+7,y:y+6},thickness:.5,color:MUTED});
}
async function renderClean(input:InvoicePdfInput){
  const {invoice,organization:org,client}=input;
  const contents=[...(input.contents||[])].sort((a,b)=>Number(a.position??0)-Number(b.position??0));
  const projectName=safe(input.projectName||"");
  const {total,hasAuthoritativeTotal,hasUnpriced}=financials(invoice,contents);
  const pdf=await PDFDocument.create();
  const {regular,bold,mono,orgLogo,clientLogo}=await assets(pdf,org,client);
  const W=PAGE.width,L=54,R=W-54;
  const draw=(page:any,value:string,x:number,y:number,font:any=regular,size=9,color=SOFT_BLACK)=>page.drawText(safe(value),{x,y,font,size,color});
  const right=(page:any,value:string,x:number,y:number,font:any=regular,size=9,color=SOFT_BLACK)=>{const v=safe(value);page.drawText(v,{x:x-font.widthOfTextAtSize(v,size),y,font,size,color});};
  const footer=(page:any)=>{
    page.drawLine({start:{x:L,y:53},end:{x:R,y:53},thickness:.55,color:LINE});
    draw(page,safe(org?.invoice_footer_line_2)||"Thank you for your time.",L,39,regular,8.5);
    const email=safe(org?.email),phone=safe(org?.phone);
    if(email){cleanIcon(page,L,14,"mail");draw(page,email,L+18,16,regular,7.5,MUTED);}
    if(phone){const x=email?L+185:L;cleanIcon(page,x,14,"phone");draw(page,phone,x+18,16,regular,7.5,MUTED);}
    if(org?.show_minbooks_branding===true)right(page,"MinBooks",R,16,regular,6.5,MUTED);
  };
  const identity=(page:any,continuation=false)=>{
    if(continuation){draw(page,safe(org?.name||org?.legal_name||"Organisation"),L,790,bold,11);right(page,`Invoice #${safe(invoice.invoice_number)}`,R,790,mono,8,MUTED);page.drawLine({start:{x:L,y:779},end:{x:R,y:779},thickness:.6,color:LINE});return 760;}
    const top=788;
    if(orgLogo){const d=orgLogo.scale(Math.min(38/orgLogo.width,22/orgLogo.height));page.drawImage(orgLogo,{x:L,y:top-d.height,width:d.width,height:d.height});}
    if(clientLogo){const d=clientLogo.scale(Math.min(34/clientLogo.width,20/clientLogo.height));page.drawImage(clientLogo,{x:R-d.width,y:top-d.height,width:d.width,height:d.height});}
    draw(page,"BILLED TO",L,top,bold,7.5,MUTED);draw(page,safe(client?.legal_name||client?.name||"Client"),L,top-19,bold,10.5);
    const addr=addressLines(client?.address_lines);addr.slice(0,3).forEach((line,index)=>draw(page,line,L,top-32-index*10,regular,8.2,MUTED));const infoY=top-32-Math.min(3,addr.length)*10;
    if(client?.pan)draw(page,`PAN ${client.pan}`,L,infoY-3,regular,7.8,MUTED);if(client?.gstin)draw(page,`GST ${client.gstin}`,L,infoY-15,regular,7.8,MUTED);
    const payTop=infoY-43;draw(page,"PAY TO",L,payTop,bold,7.5,MUTED);
    const pay=[`NAME  ${org?.payee_name||org?.legal_name||org?.name||""}`,`A/C NO  ${org?.account_number||""}`,`BANK  ${org?.bank_name||""}`,`BRANCH  ${org?.branch_name||""}`,`IFSC  ${org?.ifsc_code||""}`,`PAN  ${org?.pan||""}`];
    pay.filter(line=>!line.endsWith("  ")).forEach((line,index)=>draw(page,line,L,payTop-18-index*10,index===0?bold:regular,7.8,index===0?SOFT_BLACK:MUTED));
    const metaX=370,iconX=350;cleanIcon(page,iconX,top-10,"document");draw(page,"INVOICE NO",metaX,top,bold,7.5,MUTED);right(page,String(invoice.invoice_number||""),R,top-19,mono,12);
    cleanIcon(page,iconX,top-63,"calendar");draw(page,"DATE",metaX,top-53,bold,7.5,MUTED);right(page,formatDate(invoice.issue_date),R,top-72,regular,9);
    cleanIcon(page,iconX,top-116,"total");draw(page,"GRAND TOTAL",metaX,top-106,bold,7.5,MUTED);right(page,hasAuthoritativeTotal?money(total):(hasUnpriced?unknown:money(total)),R,top-130,bold,16);
    page.drawLine({start:{x:metaX,y:top-143},end:{x:R,y:top-143},thickness:.55,color:LINE});
    return Math.min(payTop-84,top-190);
  };
  let page=pdf.addPage([W,PAGE.height]);let y=identity(page,false);
  const tableHeader=()=>{page.drawRectangle({x:L,y:y-25,width:R-L,height:25,color:SOFT});page.drawLine({start:{x:L,y:y-25},end:{x:R,y:y-25},thickness:.55,color:LINE});draw(page,"DESCRIPTION",L+10,y-16,bold,7.5,MUTED);right(page,"AMOUNT",R-10,y-16,bold,7.5,MUTED);y-=25;};
  tableHeader();
  if(projectName){draw(page,projectName,L+10,y-17,bold,8.2);y-=29;}else y-=8;
  for(const item of contents){
    const lines=wrapAt(itemLabel(item),regular,350,8.2);const rowH=Math.max(28,Math.min(62,18+lines.length*9));
    if(y-rowH<92){footer(page);page=pdf.addPage([W,PAGE.height]);y=identity(page,true);tableHeader();}
    page.drawLine({start:{x:L,y:y-rowH},end:{x:R,y:y-rowH},thickness:.35,color:LINE});
    lines.slice(0,5).forEach((line,index)=>draw(page,line,L+10,y-17-index*9,regular,8.2));
    right(page,item.priced?money(itemAmount(item)):unknown,R-10,y-17,mono,8.5,item.priced?SOFT_BLACK:MUTED);y-=rowH;
  }
  if(y-35<92){footer(page);page=pdf.addPage([W,PAGE.height]);y=identity(page,true);tableHeader();}
  page.drawRectangle({x:L,y:y-35,width:R-L,height:35,borderWidth:.65,borderColor:SOFT_BLACK});draw(page,"GRAND TOTAL",L+10,y-22,bold,8.2);right(page,hasAuthoritativeTotal?money(total):(hasUnpriced?unknown:money(total)),R-10,y-22,bold,11);
  footer(page);
  return pdf.save();
}

export async function renderInvoicePdf(input:InvoicePdfInput){
  return input.templateKey==="clean"?renderClean(input):renderLegacy(input);
}
