import { NextRequest,NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPortalSession } from "@/lib/portal/auth";
import { renderReceiptPdf } from "@/lib/finance/receipt-pdf";

export async function GET(request:NextRequest,context:{params:Promise<{slug:string;paymentId:string}>}){
  const {slug,paymentId}=await context.params;
  const session=request.cookies.get("portal_session")?.value||"";
  if(!session)return new NextResponse("Unauthorized",{status:401});

  const supabase=createServiceClient();
  const sessionHash=hashPortalSession(session);
  const [{data,error},{data:organization}]=await Promise.all([
    supabase.rpc("get_client_portal",{p_slug:slug,p_session:sessionHash}),
    supabase.rpc("get_client_portal_organization",{p_slug:slug,p_session:sessionHash}),
  ]);
  if(error||!data)return new NextResponse("Portal unavailable",{status:401});

  const payload:any=data;
  const payment=(payload.payments||[]).find((row:any)=>row.id===paymentId);
  if(!payment)return new NextResponse("Receipt not found",{status:404});
  const invoice=(payload.invoices||[]).find((row:any)=>row.id===payment.invoice_id);
  const client:any=payload.client||{};

  await supabase.rpc("log_client_portal_activity",{
    p_slug:slug,
    p_session:sessionHash,
    p_action:"receipt_downloaded",
    p_resource_type:"payment",
    p_resource_id:paymentId,
  });

  const bytes=await renderReceiptPdf({
    organization:organization||{},
    client,
    invoiceNumber:String(invoice?.invoice_number||payment.invoice_number||""),
    invoiceTotal:Number(invoice?.total||0),
    payment:{
      amount:Number(payment.amount||0),
      payment_date:payment.payment_date,
      method:payment.method,
      reference:payment.reference,
      receipt_number:payment.receipt_number,
    },
  });

  const receiptNo=payment.receipt_number||`RCP-${payment.id.slice(0,8)}`;
  return new NextResponse(bytes,{headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":`attachment; filename="${receiptNo}.pdf"`,
    "Cache-Control":"private, no-store",
  }});
}
