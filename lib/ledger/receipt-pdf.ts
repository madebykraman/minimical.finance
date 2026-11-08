import {PDFDocument,StandardFonts,rgb} from "pdf-lib";
import type {TrackerPayment} from "@/lib/tracker";
type Party={name:string;legal_name?:string|null;address?:string|null;email?:string|null};
const text=(v:unknown)=>String(v??"").replace(/[‘’]/g,"'").replace(/[–—]/g,"-").replace(/₹/g,"INR ").replace(/[^ -~]/g,"?").trim();
const money=(n:number)=>"INR "+Number(n).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
export async function renderPaymentReceipt({organization,client,payment}:{organization:Party;client:{name:string}|null;payment:TrackerPayment}){
 if(!payment.invoice_number||!Number.isFinite(Number(payment.amount))||Number(payment.amount)<=0)
  throw new Error("Invalid payment details");
 const pdf=await PDFDocument.create(),page=pdf.addPage([595,842]);
 const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const ink=rgb(.13,.18,.28),muted=rgb(.47,.54,.64),blue=rgb(.16,.36,.80),line=rgb(.88,.90,.94);
 const draw=(s:unknown,x:number,y:number,size=10,strong=false,color=ink)=>{
  const content=text(s).slice(0,185);
  page.drawText(content,{x,y,size,font:strong?bold:regular,color});
 };
 const right=(s:unknown,x:number,y:number,size=10,strong=false,color=ink)=>{
  const content=text(s).slice(0,90),font=strong?bold:regular;
  draw(content,Math.max(46,x-font.widthOfTextAtSize(content,size)),y,size,strong,color);
 };
 pdf.setTitle("Receipt "+payment.id.slice(0,8)+" - "+text(organization.name));
 page.drawRectangle({x:0,y:806,width:595,height:36,color:blue});
 draw("FINANCE   /   PAYMENT RECEIPT",46,819,10,true,rgb(1,1,1));
 draw(organization.legal_name||organization.name,46,740,21,true);
 if(organization.address)draw(organization.address,46,712,9,false,muted);
 if(organization.email)draw(organization.email,46,696,9,false,muted);
 draw("RECEIVED FROM",46,644,9,true,muted);
 draw(client?.name||"Client not specified",46,622,14,true);
 draw("PAID ON",370,644,9,true,muted);
 draw(payment.paid_on,370,622,12,true);
 page.drawRectangle({x:46,y:460,width:503,height:119,color:rgb(.944,.960,.996),borderWidth:.5,borderColor:line});
 draw("AMOUNT RECEIVED",64,548,10,true,muted);
 draw(money(Number(payment.amount)),64,498,31,true,blue);
 const details:[string,unknown][]=[["Invoice number",payment.invoice_number],["Payment method",String(payment.method).replaceAll("_"," ")],["Reference",payment.reference||"Not provided"]];
 let y=425;
 for(const [label,value] of details){
  draw(label,46,y,10,false,muted);right(value,548,y,10,true);y-=21;
  page.drawLine({start:{x:46,y},end:{x:548,y},thickness:.6,color:line});y-=23;
 }
 if(payment.notes){draw("NOTES",46,255,9,true,muted);draw(payment.notes,46,238,9)}
 page.drawLine({start:{x:46,y:95},end:{x:549,y:95},thickness:.75,color:line});
 draw("Generated from a recorded payment. Not a bank-issued confirmation.",46,72,9,false,muted);
 draw("Issued by "+organization.name,46,55,9,false,muted);
 return pdf.save();
}
