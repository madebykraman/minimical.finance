import { NextResponse } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";

function safe(value: unknown){return String(value??"").replace(/[\r\n\t]+/g," ").trim();}
function money(value:number){return `₹${Math.round(value).toLocaleString("en-IN")}/-`;}
function dateLabel(value?:string|null){if(!value)return "—";const d=new Date(value+"T00:00:00");return Number.isNaN(d.getTime())?value:d.toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"});}

export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;
  const supabase=await createClient();
  const {data:user}=await supabase.auth.getUser();
  if(!user.user)return new NextResponse("Unauthorized",{status:401});
  const {data:payment,error}=await supabase.from("payments").select("*, invoices(*, clients(*), organizations(*))").eq("id",id).maybeSingle();
  if(error||!payment)return new NextResponse("Payment not found",{status:404});
  const invoice:any=payment.invoices||{};
  const client:any=invoice.clients||{};
  const org:any=invoice.organizations||{};

  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const regular=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","Geist-Regular.ttf")),{subset:true});
  const bold=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","Geist-SemiBold.ttf")),{subset:true});
  const mono=await pdf.embedFont(await readFile(join(process.cwd(),"public","fonts","GeistMono-Regular.ttf")),{subset:true});
  const page=pdf.addPage([595.2756,841.8898]);
  const black=rgb(0,0,0);const x=62;let y=770;
  const text=(v:string,xx:number,yy:number,font:any,size=10)=>page.drawText(safe(v),{x:xx,y:yy,font,size,color:black});
  text("PAYMENT RECEIPT",x,y,bold,16);y-=30;
  text(safe(org.name||org.legal_name||""),x,y,bold,11);y-=24;
  page.drawLine({start:{x,y},end:{x:533,y},thickness:.7,color:black});y-=32;
  text("RECEIVED FROM",x,y,bold,9);y-=17;
  text(safe(client.legal_name||client.name||"Client"),x,y,regular,10);
  if(client.email){y-=14;text(safe(client.email),x,y,regular,9);}
  y-=34;
  text("AMOUNT RECEIVED",x,y,bold,9);y-=20;text(money(Number(payment.amount||0)),x,y,mono,20);
  y-=42;
  const facts=[["Invoice",`#${safe(invoice.invoice_number||invoice.number)}`],["Payment date",dateLabel(payment.payment_date)],["Method",String(payment.method||"").replaceAll("_"," ")],["Reference",payment.reference||payment.transaction_reference||"—"]];
  facts.forEach(([label,value])=>{text(label,x,y,bold,8);text(String(value),180,y,regular,9);y-=22;});
  y-=18;page.drawLine({start:{x,y},end:{x:533,y},thickness:.7,color:black});y-=24;
  text(`Invoice total: ${money(Number(invoice.total_amount||0))}`,x,y,regular,9);y-=16;
  text("This receipt records the payment captured against the invoice above.",x,y,regular,9);
  y=58;text(safe(org.invoice_footer_line_1||"Please retain this receipt for your records."),x,y,regular,8);y-=13;text(safe(org.invoice_footer_line_2||"Thank you."),x,y,regular,8);
  const bytes=await pdf.save();
  const number=safe(invoice.invoice_number||invoice.number||"payment");
  return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition:`attachment; filename="Receipt_${number}-${id.slice(0,8)}.pdf"`,"Cache-Control":"private, no-store"}});
}
