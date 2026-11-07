import {NextResponse} from "next/server";
import {PDFDocument,StandardFonts,rgb,type PDFFont,type PDFPage} from "pdf-lib";
import {workspaceUser,serviceClient} from "@/lib/ledger/server";
import {portalSession} from "@/lib/ledger/portal";
import {invoiceGroups,invoiceBelongsToClient,type TrackerRow,type TrackerPayment} from "@/lib/tracker";

export const runtime="nodejs";
const safe=(v:unknown)=>String(v??"").replace(/[\u2018\u2019]/g,"'").replace(/[\u2013\u2014]/g,"-").replace(/\u00d7/g,"x").replace(/[^ -~]/g," ").replace(/\s+/g," ").trim();
const rupees=(v:number)=>"INR "+Number(v).toLocaleString("en-IN",{maximumFractionDigits:2,minimumFractionDigits:0});
function wrap(text:string,font:PDFFont,size:number,width:number){
 const words=safe(text).split(" ");const lines:string[]=[];let line="";
 for(const word of words){
  const next=line?line+" "+word:word;
  if(font.widthOfTextAtSize(next,size)<=width){line=next;continue;}
  if(line)lines.push(line);
  if(font.widthOfTextAtSize(word,size)<=width){line=word;continue;}
  let piece="";
  for(const c of word){if(font.widthOfTextAtSize(piece+c,size)>width){lines.push(piece);piece=c}else piece+=c;}
  line=piece;
 }
 if(line)lines.push(line);
 return lines.length?lines:[""];
}
export async function GET(request:Request,{params}:{params:Promise<{number:string}>}){
 try{
  const {number}=await params;
  if(!/^[a-zA-Z0-9-]{1,48}$/.test(number))
   return NextResponse.json({error:"Invalid invoice number."},{status:400});
  const admin=!!await workspaceUser();
  const portal=admin?false:await portalSession();
  if(!admin&&!portal)return NextResponse.json({error:"Authorisation required."},{status:401});
  const db=serviceClient(),queryOrg=new URL(request.url).searchParams.get("org");
  const {data:organization,error:orgError}=admin&&queryOrg?
   await db.from("tracker_organizations").select("*").eq("id",queryOrg).maybeSingle():
   await db.from("tracker_organizations").select("*").eq("name","Kumar Aman").maybeSingle();
  if(orgError||!organization)return NextResponse.json({error:"Organisation not found."},{status:404});
  // Invoice identity is scoped by the organisation, never by the number alone.
  const [r,p,cs]=await Promise.all([
   db.from("tracker_rows").select("*").eq("organization_id",organization.id).eq("invoice_number",number).order("row_order"),
   db.from("tracker_payments").select("*").eq("organization_id",organization.id).eq("invoice_number",number),
   db.from("tracker_clients").select("*").eq("organization_id",organization.id)
  ]);
  if([r.error,p.error,cs.error].some(Boolean))throw new Error("Invoice data could not be loaded.");
  const allRows=(r.data??[]) as TrackerRow[];
  const invoice=invoiceGroups(allRows,(p.data??[]) as TrackerPayment[])[0];
  if(!invoice)return NextResponse.json({error:"Invoice not found."},{status:404});
  const ids=[...new Set(allRows.map(x=>x.client_id).filter(Boolean))];
  if(ids.length>1)return NextResponse.json({error:"Invoice has more than one client; review before generating."},{status:409});
  if(!admin){
   const sourceClient=(cs.data??[]).find(c=>c.name==="Elle India");
   if(!sourceClient||!invoiceBelongsToClient(allRows,number,sourceClient.id))
    return NextResponse.json({error:"Invoice is not shared with this client."},{status:403});
  }
  const client=(cs.data??[]).find(c=>c.id===ids[0])??null;
  const pdf=await PDFDocument.create();
  pdf.setTitle(safe(organization.name+" - Invoice "+number));
  pdf.setAuthor(safe(organization.legal_name||organization.name));
  const normal=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink=rgb(.13,.18,.28),muted=rgb(.48,.53,.62),blue=rgb(.17,.36,.72),line=rgb(.87,.9,.95);
  const top=784,margin=48,width=499;
  let page:PDFPage=pdf.addPage([595,842]),y=top,pages=1;
  const draw=(v:unknown,x:number,at:number,size=10,isBold=false,color=ink)=>{
   page.drawText(safe(v),{x,y:at,size,font:isBold?bold:normal,color});
  };
  const right=(v:string,to:number,at:number,size=10,isBold=false,color=ink)=>{
   draw(v,to-(isBold?bold:normal).widthOfTextAtSize(safe(v),size),at,size,isBold,color);
  };
  const hr=(at:number)=>page.drawLine({start:{x:margin,y:at},end:{x:margin+width,y:at},thickness:.75,color:line});
  const nextPage=()=>{
   page=pdf.addPage([595,842]);pages++;y=top;
   draw(safe(organization.name),margin,y,10,true,blue);
   right("Invoice "+number+" - continued",margin+width,y,9,false,muted);y-=30;hr(y);y-=23;
  };
  const from=organization.legal_name||organization.name;
  draw("INVOICE",margin,y,11,true,blue);right("No. "+number,margin+width,y,11,true,ink);y-=35;
  draw(from,margin,y,22,true);y-=25;
  if(organization.address){for(const segment of wrap(organization.address,normal,9,340).slice(0,3)){draw(segment,margin,y,9,false,muted);y-=14;}}
  if(organization.email){draw(organization.email,margin,y,9,false,muted);y-=13;}
  if(organization.gstin){draw("GSTIN: "+organization.gstin,margin,y,9,false,muted);y-=13;}
  y-=18;hr(y);y-=26;
  draw("BILL TO",margin,y,9,true,muted);
  draw("INVOICE DETAILS",335,y,9,true,muted);y-=20;
  draw(client?.name||"Client not specified",margin,y,13,true);
  draw("Issued: "+(invoice.date||"Date not supplied"),335,y,9,false,ink);y-=18;
  if(client?.address){for(const segment of wrap(client.address,normal,9,255).slice(0,3)){draw(segment,margin,y,9,false,muted);y-=14;}}
  if(client?.email){draw(client.email,margin,y,9,false,muted);y-=13;}
  if(client?.gstin){draw("Client GSTIN: "+client.gstin,margin,y,9,false,muted);y-=14;}
  const status=invoice.balance<=0?"Paid":invoice.paid>0?"Part paid":"Unpaid";
  draw("Status: "+status,335,y+14,9,true,invoice.balance<=0?rgb(.14,.48,.38):ink);
  y=Math.min(y,617);y-=26;
  page.drawRectangle({x:margin,y:y-19,width:width,height:29,color:rgb(.958,.973,.991)});
  draw("DESCRIPTION",margin+11,y-8,9,true,muted);right("AMOUNT",margin+width-10,y-8,9,true,muted);
  y-=44;
  for(const row of invoice.rows){
   const name=safe(row.project_name.replace(/^Elle India_/i,"").replaceAll("_"," "));
   const lines=wrap(name,normal,9,350).slice(0,5);
   const height=Math.max(34,lines.length*13+12);
   if(y-height<155)nextPage();
   for(let k=0;k<lines.length;k++)draw(lines[k],margin+9,y-k*13,9);
   right(row.amount==null?"Not priced":rupees(Number(row.amount)),margin+width-9,y,9,true);
   y-=height;hr(y+8);y-=8;
  }
  if(y<210)nextPage();
  y-=11;
  draw("WORK ITEM TOTAL",margin+10,y,9,false,muted);right(rupees(invoice.lineTotal),margin+width-10,y,10,true);y-=24;
  draw("INVOICE TOTAL",margin+10,y,11,true);right(rupees(invoice.total),margin+width-10,y,15,true,blue);y-=26;
  draw("PAID / SETTLED",margin+10,y,9,false,muted);right(rupees(invoice.paid),margin+width-10,y,10,true);y-=24;
  hr(y+8);
  draw("AMOUNT DUE",margin+10,y-14,11,true);right(rupees(invoice.balance),margin+width-10,y-14,15,true,blue);y-=54;
  if(Math.abs(invoice.discrepancy)>.001){
   draw("RECONCILIATION NOTE",margin,y,9,true,rgb(.61,.4,.16));y-=14;
   for(const segment of wrap("The sum of work items differs from the recorded invoice total. Both figures are preserved.",normal,8.5,width)){
    draw(segment,margin,y,8.5,false,muted);y-=12;
   }y-=9;
  }
  if(organization.bank_name||organization.bank_account||organization.bank_ifsc){
   if(y<160)nextPage();
   draw("PAYMENT DETAILS",margin,y,9,true,muted);y-=16;
   if(organization.bank_name){draw("Bank: "+organization.bank_name,margin,y,9);y-=13;}
   if(organization.bank_account){draw("Account: "+organization.bank_account,margin,y,9);y-=13;}
   if(organization.bank_ifsc){draw("IFSC: "+organization.bank_ifsc,margin,y,9);y-=13;}
  }
  if(organization.invoice_footer&&y>110){
   y-=12;for(const segment of wrap(organization.invoice_footer,normal,8.5,width).slice(0,3)){draw(segment,margin,y,8.5,false,muted);y-=12;}
  }
  // A regenerated workbook-era invoice is an informative copy, not an immutable original.
  const note=invoice.document?"Generated from current records. Original referenced file: "+invoice.document:
   "Generated electronically from current finance records; review before external issuance.";
  const footerLines=wrap(note,normal,8,497).slice(0,2);
  for(let i=0;i<footerLines.length;i++)draw(footerLines[i],margin,70-i*11,8,false,muted);
  draw("Page "+pages,margin,39,8,false,muted);
  const file=Buffer.from(await pdf.save());
  return new NextResponse(file,{headers:{
   "Content-Type":"application/pdf",
   "Content-Disposition":'inline; filename="invoice-'+number+'.pdf"',
   "Cache-Control":"private, no-store",
   "X-Content-Type-Options":"nosniff"
  }});
 }catch(e){
  return NextResponse.json({error:"Invoice could not be generated."},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
