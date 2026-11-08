import {NextResponse} from "next/server";
import {workspaceUser,serviceClient} from "@/lib/ledger/server";
import {portalSession} from "@/lib/ledger/portal";
import {renderInvoicePdf} from "@/lib/ledger/invoice-pdf";
import {invoiceGroups,invoiceBelongsToClient,type TrackerRow,type TrackerPayment} from "@/lib/tracker";
export const runtime="nodejs";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request:Request,{params}:{params:Promise<{number:string}>}){
 try{
  const {number}=await params;
  if(!/^[A-Za-z0-9-]{1,48}$/.test(number))return NextResponse.json({error:"Invalid invoice number."},{status:400});
  const admin=await workspaceUser();
  const portal=admin?false:await portalSession();
  if(!admin&&!portal)return NextResponse.json({error:"Sign in to generate an invoice."},{status:401});
  // Member queries use their own RLS-protected session. Only the password-based
  // read-only portal uses the privileged server session.
  const db=admin?(admin.db as unknown as ReturnType<typeof serviceClient>):serviceClient();
  const orgId=new URL(request.url).searchParams.get("org");
  if(admin&&!orgId)return NextResponse.json({error:"Choose an organisation."},{status:400});
  if(admin&&!uuid.test(orgId||""))return NextResponse.json({error:"Invalid organisation."},{status:400});
  const orgQuery=db.from("tracker_organizations").select("*");
  const {data:org,error:orgError}=admin?
   await orgQuery.eq("id",orgId!).maybeSingle():
   await orgQuery.eq("name","Kumar Aman").maybeSingle();
  if(orgError)throw orgError;
  if(!org)return NextResponse.json({error:"Organisation not found."},{status:404});
  const [work,payments,clientRecords]=await Promise.all([
   db.from("tracker_rows").select("*").eq("organization_id",org.id).eq("invoice_number",number).order("row_order"),
   db.from("tracker_payments").select("*").eq("organization_id",org.id).eq("invoice_number",number),
   db.from("tracker_clients").select("id,name,address,email,gstin").eq("organization_id",org.id)
  ]);
  const dbError=work.error||payments.error||clientRecords.error;
  if(dbError)throw dbError;
  const rows=(work.data??[]) as TrackerRow[];
  const invoice=invoiceGroups(rows,(payments.data??[]) as TrackerPayment[])[0];
  if(!invoice)return NextResponse.json({error:"Invoice not found in this organisation."},{status:404});
  const clientIds=[...new Set(rows.map(x=>x.client_id).filter((x):x is string=>!!x))];
  if(clientIds.length>1)return NextResponse.json({error:"Invoice contains multiple clients. Correct the records before PDF generation."},{status:409});
  if(!admin){
   if(invoice.sourceStatus==="Draft")return NextResponse.json({error:"Drafts are private."},{status:403});
   const allowed=(clientRecords.data??[]).find(c=>c.name==="Elle India");
   if(!allowed||!invoiceBelongsToClient(rows,number,allowed.id))
    return NextResponse.json({error:"Invoice not available to this client."},{status:403});
  }
  const client=(clientRecords.data??[]).find(c=>c.id===clientIds[0])??null;
  const bytes=await renderInvoicePdf({organization:org,client,invoice});
  const disposition=new URL(request.url).searchParams.get("download")==="1"?"attachment":"inline";
  return new NextResponse(Buffer.from(bytes),{headers:{"Content-Type":"application/pdf",
   "Content-Disposition":disposition+'; filename="invoice-'+number+'.pdf"',
   "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(e){
  console.error("[invoice/pdf] generation failed:",e instanceof Error?e.message:"Unknown error");
  return NextResponse.json({error:"Could not generate this invoice PDF. Check the invoice records and try again."},
   {status:503,headers:{"Cache-Control":"no-store"}});
 }
}
