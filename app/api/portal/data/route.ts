import {NextResponse} from "next/server";
import {portalSession} from "@/lib/ledger/portal";
import {serviceClient} from "@/lib/ledger/server";
import {invoiceGroups,invoiceBelongsToClient} from "@/lib/tracker";
import type {TrackerRow,TrackerPayment} from "@/lib/tracker";
export async function GET(){
  try{
    if(!await portalSession())return NextResponse.json({error:"Password required"},{status:401,headers:{"Cache-Control":"no-store"}});
    const db=serviceClient();
    const {data:org,error:orgError}=await db.from("tracker_organizations").select("id").eq("name","Kumar Aman").maybeSingle();
    if(orgError||!org)throw new Error("Organisation not found.");
    const [sn,r,p,docs,cl]=await Promise.all([
      db.from("tracker_snapshots").select("owner_name,balance_as_of,source_title").eq("organization_id",org.id).order("created_at",{ascending:false}).limit(1).maybeSingle(),
      db.from("tracker_rows").select("id,client_id,row_order,project_name,amount,invoice_number,invoice_date,invoice_printed_total,invoice_state,payment_state,invoice_pdf_name,source_paid,source_paid_on").eq("organization_id",org.id).not("invoice_number","is",null),
      db.from("tracker_payments").select("invoice_number,amount,paid_on,method").eq("organization_id",org.id),
      db.from("tracker_documents").select("id,client_id,file_name,invoice_number,mime_type").eq("organization_id",org.id).eq("visible_to_client",true),
      db.from("tracker_clients").select("id,name").eq("organization_id",org.id).eq("name","Elle India").limit(1).maybeSingle()
    ]);
    if([sn.error,r.error,p.error,docs.error,cl.error].some(Boolean))throw new Error("Unable to read portal");
    const allRows=(r.data??[]) as unknown as TrackerRow[];
    // Never expose an entire invoice group if it also contains another client's work.
    const clientRows=allRows.filter(x=>x.client_id===cl.data?.id &&
      invoiceBelongsToClient(allRows,x.invoice_number??"",cl.data?.id));
    const invoices=invoiceGroups(clientRows,(p.data??[]) as unknown as TrackerPayment[]).filter(g=>g.sourceStatus!=="Draft").map(g=>({
      number:g.number,total:g.total,paid:g.paid,balance:g.balance,date:g.date,status:g.balance<=0?"Paid":g.paid>0?"Partially paid":"Unpaid",
      projects:g.rows.map(x=>({name:x.project_name,amount:x.amount}))
    }));
    return NextResponse.json({client:cl.data?.name||"Elle India",owner:sn.data?.owner_name||"Kumar Aman",sourceDate:sn.data?.balance_as_of,invoices,documents:(docs.data||[]).filter(x=>x.client_id===cl.data?.id).map(x=>({id:x.id,file_name:x.file_name,invoice_number:x.invoice_number,mime_type:x.mime_type}))},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return NextResponse.json({error:"Portal unavailable"},{status:503,headers:{"Cache-Control":"no-store"}})}
}
