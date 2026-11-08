import {NextResponse} from "next/server";
import {workspaceUser,serviceClient} from "@/lib/ledger/server";
import {renderPaymentReceipt} from "@/lib/ledger/receipt-pdf";
import type {TrackerPayment} from "@/lib/tracker";
export const runtime="nodejs";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const member=await workspaceUser();
 if(!member)return NextResponse.json({error:"Sign in to generate receipts."},{status:401});
 try{
  const {id}=await params,orgId=new URL(request.url).searchParams.get("org");
  if(!uuid.test(id)||!orgId||!uuid.test(orgId))
   return NextResponse.json({error:"Choose a valid receipt and organisation."},{status:400});
  // The authenticated workspace member has RLS-protected access to finance data.
  const db=member.db as unknown as ReturnType<typeof serviceClient>;
  const [orgRes,payRes]=await Promise.all([
   db.from("tracker_organizations").select("*").eq("id",orgId).maybeSingle(),
   db.from("tracker_payments").select("*").eq("id",id).eq("organization_id",orgId).maybeSingle()
  ]);
  if(orgRes.error||payRes.error)throw orgRes.error||payRes.error;
  if(!orgRes.data||!payRes.data)return NextResponse.json({error:"Receipt not found."},{status:404});
  const payment=payRes.data as TrackerPayment;
  const {data:items,error:itemsError}=await db.from("tracker_rows").select("client_id").eq("organization_id",orgId).eq("invoice_number",payment.invoice_number);
  if(itemsError)throw itemsError;
  const clientIds=[...new Set((items??[]).map(x=>x.client_id).filter((x):x is string=>!!x))];
  if(clientIds.length>1)return NextResponse.json({error:"This invoice has conflicting clients."},{status:409});
  const {data:client,error:clientError}=clientIds.length?
    await db.from("tracker_clients").select("name").eq("id",clientIds[0]).eq("organization_id",orgId).maybeSingle():
    {data:null,error:null};
  if(clientError)throw clientError;
  const bytes=await renderPaymentReceipt({organization:orgRes.data,client,payment});
  return new NextResponse(Buffer.from(bytes),{headers:{"Content-Type":"application/pdf",
   "Content-Disposition":'attachment; filename="receipt-'+id.slice(0,8)+'.pdf"',
   "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(e){
  console.error("[receipt/pdf] generation failed:",e instanceof Error?e.message:"Unknown error");
  return NextResponse.json({error:"Could not generate this payment receipt."},{status:503});
 }
}
