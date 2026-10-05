import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getDocumentTemplate } from "@/lib/finance/document-templates";
import { renderReceiptPdf } from "@/lib/finance/receipt-pdf";

export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;
  const supabase=await createClient();
  const {data:user}=await supabase.auth.getUser();
  if(!user.user)return new NextResponse("Unauthorized",{status:401});

  const {data:payment,error}=await supabase
    .from("payments")
    .select("*,invoices(*,clients(*),organizations(*),invoice_contents(*),payments(*))")
    .eq("id",id)
    .maybeSingle();
  if(error||!payment)return new NextResponse("Payment not found",{status:404});

  const invoice:any=payment.invoices||{};
  const client:any=invoice.clients||{};
  const organization:any=invoice.organizations||{};
  const invoiceTotal=(invoice.invoice_contents||[]).reduce((sum:number,item:any)=>
    sum+(item.priced?Number(item.amount??Number(item.quantity||1)*Number(item.rate||0)):0),0
  );
  const paidTotal=(invoice.payments||[]).reduce((sum:number,row:any)=>sum+Number(row.amount||0),0);
  const invoiceBalance=Math.max(invoiceTotal-paidTotal,0);
  const templateKey=getDocumentTemplate("receipt-v1","receipt")?.key||"receipt-v1";
  const bytes=await renderReceiptPdf({
    organization,
    client,
    invoiceNumber:String(invoice.invoice_number||""),
    invoiceTotal,
    invoiceBalance,
    payment:{
      amount:Number(payment.amount||0),
      payment_date:payment.payment_date,
      method:payment.method,
      reference:payment.reference,
      receipt_number:payment.receipt_number,
      notes:payment.notes,
    },
  });

  const checksum=createHash("sha256").update(bytes).digest("hex");
  const receiptNo=String(payment.receipt_number||invoice.invoice_number||id.slice(0,8));
  const fileName=`Receipt-${receiptNo}.pdf`;
  const filePath=`organizations/${payment.organization_id}/receipts/${payment.id}/v1.pdf`;

  const {data:document}=await supabase.from("documents").select("id").eq("payment_id",id).eq("document_type","receipt_pdf").eq("version_number",1).maybeSingle();
  if(document?.id){
    const upload=await supabase.storage.from("finos-documents").upload(filePath,bytes,{contentType:"application/pdf",upsert:true});
    const generatedAt=new Date().toISOString();
    await supabase.from("documents").update({
      status:upload.error?"generated":"stored",
      file_path:upload.error?"":filePath,
      file_name:fileName,
      storage_bucket:"finos-documents",
      generated_at:generatedAt,
      checksum_sha256:checksum,
      size_bytes:bytes.length,
      template_key:templateKey,
    }).eq("id",document.id);
    await supabase.from("document_versions").upsert({
      document_id:document.id,
      version_number:1,
      file_path:upload.error?null:filePath,
      file_name:fileName,
      storage_bucket:"finos-documents",
      mime_type:"application/pdf",
      size_bytes:bytes.length,
      checksum_sha256:checksum,
      generated_at:generatedAt,
      generated_by:user.user.id,
      metadata:{template_key:templateKey,storage_error:upload.error?.message??null},
    },{onConflict:"document_id,version_number"});
  }

  return new NextResponse(bytes,{headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":`attachment; filename="${fileName}"`,
    "Cache-Control":"private, no-store",
  }});
}
