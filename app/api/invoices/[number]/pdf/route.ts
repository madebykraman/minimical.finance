import {NextResponse} from "next/server";
import {PDFDocument,StandardFonts,rgb} from "pdf-lib";
import {workspaceUser,serviceClient} from "@/lib/ledger/server";
import {portalSession} from "@/lib/ledger/portal";
import {invoiceGroups,invoiceBelongsToClient,type TrackerRow,type TrackerPayment} from "@/lib/tracker";
const clean=(s:unknown)=>String(s??"").replace(/[\u2018\u2019]/g,"'").replace(/[\u2013\u2014]/g,"-").replace(/\u00d7/g,"x").replace(/[^\x20-\x7e]/g," ").replace(/\s+/g," ").trim();
const amt=(v:number)=>"INR "+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2,minimumFractionDigits:0});
const cut=(s:string,max:number)=>s.length<=max?s:s.slice(0,max-3)+"...";
export async function GET(_req:Request,{params}:{params:Promise<{number:string}>}){
 try{
  const {number}=await params;if(!/^[a-zA-Z0-9-]{1,36}$/.test(number))return NextResponse.json({error:"Invalid invoice number."},{status:400});
  const admin=!!await workspaceUser();
  if(!admin&&!await portalSession())return NextResponse.json({error:"Not authorised"},{status:401});
  const db=serviceClient();
  const [r,p,s,c]=await Promise.all([
   db.from("tracker_rows").select("*").eq("invoice_number",number).order("row_order"),
   db.from("tracker_payments").select("*").eq("invoice_number",number),
   db.from("tracker_snapshots").select("owner_name,source_title").order("created_at",{ascending:false}).limit(1).maybeSingle(),
   db.from("tracker_clients").select("id,name").eq("from_source_pdf",true).limit(1).maybeSingle()
  ]);
  if([r.error,p.error,s.error,c.error].some(Boolean))throw new Error("Data unavailable.");
  const invoice=invoiceGroups((r.data??[]) as TrackerRow[],(p.data??[]) as TrackerPayment[])[0];
  if(!invoice)return NextResponse.json({error:"Invoice not found."},{status:404});
  if(!admin&&!invoiceBelongsToClient((r.data??[]) as TrackerRow[],number,c.data?.id))
    return NextResponse.json({error:"Invoice is not shared."},{status:403});
  const pdf=await PDFDocument.create();
  pdf.setTitle("Invoice "+number+" - Tracker summary");
  const normal=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy=rgb(.10,.17,.28),grey=rgb(.44,.5,.59),blue=rgb(.15,.39,.88),border=rgb(.88,.91,.95);
  let page=pdf.addPage([595,842]);let y=780;
  function text(s:string,x:number,pos:number,size=10,weight:"normal"|"bold"="normal",color=navy){
    page.drawText(cut(clean(s),125),{x,y:pos,size,font:weight==="bold"?bold:normal,color});
  }
  function newPage(){page=pdf.addPage([595,842]);y=780;text("INVOICE TRACKER SUMMARY",44,798,9,"bold",blue);}
  text("FINANCE WORKSPACE",44,y,11,"bold",blue);text("TRACKER SUMMARY",433,y,9,"bold",grey);y-=36;
  text("Invoice #"+number,44,y,25,"bold");y-=32;
  text("From: "+clean(s.data?.owner_name||"Kumar Aman"),44,y,10);y-=17;
  text("To: "+clean(c.data?.name||"Elle India"),44,y,10);y-=17;
  text("Issue date: "+(invoice.date||"Not supplied"),44,y,10);y-=32;
  page.drawRectangle({x:44,y:y-67,width:507,height:78,color:rgb(.945,.967,1),borderColor:border,borderWidth:.5});
  text("PRINTED INVOICE TOTAL",58,y-8,9,"bold",grey);text(amt(invoice.total),58,y-38,19,"bold");
  text("REMAINING BALANCE",342,y-8,9,"bold",grey);text(amt(invoice.balance),342,y-38,17,"bold");
  y-=101;text("WORK / DESCRIPTION",44,y,9,"bold",grey);text("AMOUNT",458,y,9,"bold",grey);y-=11;
  page.drawLine({start:{x:44,y},end:{x:551,y},thickness:.7,color:border});
  y-=23;
  for(const row of invoice.rows){
    if(y<120)newPage();
    const raw=clean(row.project_name.replace(/^Elle India_/i,"").replaceAll("_"," "));
    text(cut(raw,66),44,y,9);text(row.amount===null?"Not specified":amt(Number(row.amount)),455,y,9,"bold");
    y-=25;page.drawLine({start:{x:44,y:y+8},end:{x:551,y:y+8},thickness:.4,color:border});
  }
  y-=17;if(y<105)newPage();
  text("Sum of work items",44,y,10);text(amt(invoice.lineTotal),450,y,10,"bold");y-=23;
  text("Paid",44,y,10);text(amt(invoice.paid),450,y,10,"bold");y-=35;
  if(Math.abs(invoice.discrepancy)>.001){text("Source discrepancy: item sum differs from PDF printed total.",44,y,9,"bold",rgb(.69,.38,.12));y-=22;}
  text("Generated from the uploaded tracker. This is not a copy of the original issued invoice.",44,56,8,"normal",grey);
  const out=await pdf.save();
  return new NextResponse(Buffer.from(out),{headers:{"Content-Type":"application/pdf","Content-Disposition":'inline; filename="invoice-'+number+'-tracker-summary.pdf"',"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Could not generate tracker summary."},{status:503})}
}
