import {NextResponse} from "next/server";
import {PDFDocument} from "pdf-lib";
import {workspaceUser,serviceClient} from "@/lib/ledger/server";
import {renderInvoicePdf} from "@/lib/ledger/invoice-pdf";
import {invoiceGroups,type TrackerRow,type TrackerPayment} from "@/lib/tracker";

export const runtime="nodejs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedStatus=new Set(["all","issued","draft","open","paid"]);

/**
 * Export a selected organisation's invoices into one printable PDF document.
 * No storage write, public service key, client-side secrets, or sheet dependency.
 */
export async function GET(request:Request){
 const member=await workspaceUser();
 if(!member)return NextResponse.json({error:"A signed-in workspace member is required."},{status:401});
 try{
  const params=new URL(request.url).searchParams;
  const orgId=params.get("org"),filter=params.get("status")||"all";
  if(!orgId||!UUID.test(orgId))return NextResponse.json({error:"Choose a valid organisation."},{status:400});
  if(!allowedStatus.has(filter))return NextResponse.json({error:"Invalid invoice filter."},{status:400});
  const db=member.db as unknown as ReturnType<typeof serviceClient>;
  const [orgResult,rowsResult,paymentsResult,clientsResult]=await Promise.all([
   db.from("tracker_organizations").select("*").eq("id",orgId).maybeSingle(),
   db.from("tracker_rows").select("*").eq("organization_id",orgId).not("invoice_number","is",null).order("row_order"),
   db.from("tracker_payments").select("*").eq("organization_id",orgId),
   db.from("tracker_clients").select("id,name,address,email,gstin").eq("organization_id",orgId)
  ]);
  if(orgResult.error||rowsResult.error||paymentsResult.error||clientsResult.error){
   throw orgResult.error||rowsResult.error||paymentsResult.error||clientsResult.error;
  }
  if(!orgResult.data)return NextResponse.json({error:"Organisation unavailable."},{status:404});
  const all=invoiceGroups((rowsResult.data??[]) as TrackerRow[],(paymentsResult.data??[]) as TrackerPayment[]);
  const filtered=all.filter(i=>{
   if(filter==="issued")return i.sourceStatus!=="Draft";
   if(filter==="draft")return i.sourceStatus==="Draft";
   if(filter==="open")return i.sourceStatus!=="Draft"&&i.balance>0;
   if(filter==="paid")return i.sourceStatus!=="Draft"&&i.balance<=0;
   return true;
  });
  if(!filtered.length)return NextResponse.json({error:"No invoices match this selection."},{status:404});
  if(filtered.length>100)return NextResponse.json({error:"More than 100 invoices: narrow the selection and retry."},{status:413});
  const clientMap=new Map((clientsResult.data??[]).map(client=>[client.id,client]));
  const combined=await PDFDocument.create();
  combined.setTitle("Invoices - "+orgResult.data.name);
  combined.setAuthor(orgResult.data.legal_name||orgResult.data.name);
  for(const invoice of filtered){
   const ids=[...new Set(invoice.rows.map(r=>r.client_id).filter((id):id is string=>!!id))];
   if(ids.length>1)return NextResponse.json({error:"Invoice "+invoice.number+" has conflicting clients. Correct it before exporting."},{status:409});
   const client=ids.length?clientMap.get(ids[0])??null:null;
   const bytes=await renderInvoicePdf({organization:orgResult.data,client,invoice});
   const document=await PDFDocument.load(bytes);
   const pages=await combined.copyPages(document,document.getPageIndices());
   for(const page of pages)combined.addPage(page);
  }
  const bytes=Buffer.from(await combined.save());
  const fileName="invoices-"+orgResult.data.name.toLowerCase().replace(/[^a-z0-9-]+/g,"-").slice(0,45)+".pdf";
  return new NextResponse(bytes,{headers:{
   "Content-Type":"application/pdf",
   "Content-Disposition":'attachment; filename="'+fileName+'"',
   "Cache-Control":"private, no-store",
   "X-Content-Type-Options":"nosniff"
  }});
 }catch(e){
  console.error("[invoices/pdf] batch export failed",e instanceof Error?e.message:"Unexpected error");
  return NextResponse.json({error:"Could not generate the selected invoice PDFs."},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
