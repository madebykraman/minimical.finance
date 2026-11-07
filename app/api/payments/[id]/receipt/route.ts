import {NextResponse} from "next/server";
import {PDFDocument,StandardFonts,rgb} from "pdf-lib";
import {workspaceUser,serviceClient} from "@/lib/ledger/server";
export const runtime="nodejs";
const clean=(v:unknown)=>String(v??"").replace(/[\u2018\u2019]/g,"'").replace(/[\u2013\u2014]/g,"-").replace(/[^ -~]/g," ").trim().slice(0,120);
const money=(v:number)=>"INR "+Number(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const member=await workspaceUser();
 if(!member)return NextResponse.json({error:"Workspace membership required."},{status:401});
 try{
  const {id}=await params,orgId=new URL(request.url).searchParams.get("org");
  if(!/^[0-9a-f-]{36}$/i.test(id)||!orgId||!/^[0-9a-f-]{36}$/i.test(orgId))
   return NextResponse.json({error:"Invalid receipt request."},{status:400});
  const db=serviceClient();
  const [o,p]=await Promise.all([
   db.from("tracker_organizations").select("*").eq("id",orgId).maybeSingle(),
   db.from("tracker_payments").select("*").eq("id",id).eq("organization_id",orgId).maybeSingle()
  ]);
  if(o.error||p.error)throw new Error("Receipt records unavailable.");
  if(!o.data||!p.data)return NextResponse.json({error:"Receipt not found."},{status:404});
  const org=o.data,payment=p.data;
  const {data:lineItems,error:workError}=await db.from("tracker_rows")
   .select("client_id,invoice_number").eq("organization_id",orgId).eq("invoice_number",payment.invoice_number);
  if(workError)throw workError;
  const clientIds=[...new Set((lineItems??[]).map(x=>x.client_id).filter(Boolean))];
  if(clientIds.length>1)return NextResponse.json({error:"Receipt has conflicting clients."},{status:409});
  const {data:client}=clientIds.length?await db.from("tracker_clients").select("name").eq("id",clientIds[0]).eq("organization_id",orgId).maybeSingle():{data:null};
  const pdf=await PDFDocument.create(),page=pdf.addPage([595,842]);
  const normal=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink=rgb(.12,.18,.27),muted=rgb(.45,.51,.61),blue=rgb(.15,.36,.74),line=rgb(.87,.9,.95);
  const draw=(v:unknown,x:number,y:number,size=11,heavy=false,color=ink)=>page.drawText(clean(v),{x,y,size,font:heavy?bold:normal,color});
  const right=(v:string,x:number,y:number,size=11,heavy=false)=>draw(v,x-(heavy?bold:normal).widthOfTextAtSize(clean(v),size),y,size,heavy);
  draw("PAYMENT RECEIPT",46,777,12,true,blue);
  right("Reference "+clean(payment.id.slice(0,12).toUpperCase()),550,777,9,true);
  page.drawLine({start:{x:46,y:756},end:{x:549,y:756},thickness:1,color:line});
  draw(org.legal_name||org.name,46,722,21,true);
  if(org.address)draw(org.address,46,697,9,false,muted);
  if(org.email)draw(org.email,46,682,9,false,muted);
  draw("RECEIVED FROM",46,635,9,true,muted);
  draw(client?.name||"Client not specified",46,616,13,true);
  draw("PAYMENT DATE",335,635,9,true,muted);
  draw(payment.paid_on,335,616,12,true);
  page.drawRectangle({x:46,y:464,width:503,height:106,color:rgb(.948,.968,1),borderColor:line,borderWidth:.6});
  draw("AMOUNT RECEIVED",62,540,10,true,muted);
  draw(money(payment.amount),62,493,29,true,blue);
  draw("Invoice",46,420,10,false,muted);right(String(payment.invoice_number),549,420,11,true);
  page.drawLine({start:{x:46,y:404},end:{x:549,y:404},thickness:.6,color:line});
  draw("Payment method",46,381,10,false,muted);right(String(payment.method).replaceAll("_"," "),549,381,11,true);
  page.drawLine({start:{x:46,y:365},end:{x:549,y:365},thickness:.6,color:line});
  if(payment.reference){
   draw("Transaction reference",46,341,10,false,muted);
   right(String(payment.reference),549,341,11,true);
  }
  if(payment.notes){draw("NOTES",46,290,9,true,muted);draw(payment.notes,46,272,9);}
  page.drawLine({start:{x:46,y:97},end:{x:549,y:97},thickness:1,color:line});
  draw("Generated from a recorded payment. This receipt is not a bank confirmation.",46,76,9,false,muted);
  draw("Issued by "+clean(org.name),46,57,9,false,muted);
  const output=Buffer.from(await pdf.save());
  return new NextResponse(output,{headers:{"Content-Type":"application/pdf",
   "Content-Disposition":'inline; filename="receipt-'+payment.id.slice(0,8)+'.pdf"',
   "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return NextResponse.json({error:"Receipt could not be generated."},{status:503})}
}
