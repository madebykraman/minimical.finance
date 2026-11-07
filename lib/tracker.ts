export type TrackerRow = {
  id: string; snapshot_id: string; row_order: number; project_name: string;
  assigned_by: string|null; amount: number|null; payment_state: string|null;
  invoice_number: string|null; invoice_date: string|null;
  invoice_printed_total: number|null; invoice_state: string|null;
  invoice_pdf_name: string|null; payment_date: string|null;
  work_status: "open"|"complete"|"archived"; notes: string|null;
  from_source_pdf: boolean; client_id: string|null; updated_at: string;
};
export type TrackerPayment = {
  id: string; invoice_number: string; amount: number; paid_on: string;
  method: "bank_transfer"|"upi"|"cash"|"card"|"other";
  reference: string|null; notes: string|null; created_at: string;
};
export type TrackerClient = {
  id: string; name: string; email: string|null; phone: string|null;
  notes: string|null; from_source_pdf: boolean;
};
export type Snapshot = {
  id: string; source_title: string; source_file_name: string;
  owner_name: string; balance_as_of: string; reported_pending: number;
};
export type InvoiceGroup = {
  number:string; rows:TrackerRow[]; total:number; lineTotal:number;
  paid:number; balance:number; date:string|null; sourceStatus:string;
  paymentState:string; document:string|null; discrepancy:number;
};
export const money = (n:number|null|undefined) => n==null?"—":new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(n));
export const dateLabel = (s:string|null|undefined) => s?new Date(s+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):"Not supplied";
export const titleFromSource = (s:string) => s.replace(/^Elle India_/i,"").replaceAll("_Video Editing","").replaceAll("_"," · ").trim();
export function invoiceGroups(rows:TrackerRow[],payments:TrackerPayment[]):InvoiceGroup[]{
  const grouped = new Map<string,TrackerRow[]>();
  for(const row of rows) if(row.invoice_number){const a=grouped.get(row.invoice_number)||[];a.push(row);grouped.set(row.invoice_number,a)}
  return [...grouped].map(([number,items])=>{
    const meta=items.find(x=>x.invoice_printed_total!==null)||items[0];
    const total=Number(meta.invoice_printed_total??items.reduce((s,x)=>s+Number(x.amount||0),0));
    const lineTotal=items.reduce((s,x)=>s+Number(x.amount||0),0);
    const paid=payments.filter(x=>x.invoice_number===number).reduce((s,x)=>s+Number(x.amount),0);
    return {number,rows:items.sort((a,b)=>a.row_order-b.row_order),total,lineTotal,paid,
      balance:Math.max(0,Math.round((total-paid)*100)/100),date:items.find(x=>x.invoice_date)?.invoice_date??null,
      sourceStatus:items.find(x=>x.invoice_state)?.invoice_state??"Not specified",
      paymentState:items.find(x=>x.payment_state)?.payment_state??"Not specified",
      document:items.find(x=>x.invoice_pdf_name)?.invoice_pdf_name??null,
      discrepancy:Math.round((lineTotal-total)*100)/100};
  }).sort((a,b)=>Number(a.number)-Number(b.number));
}
export const sum = (nums:number[]) => nums.reduce((a,b)=>a+Number(b||0),0);
export function csv(rows:(string|number|null|undefined)[][]){
  return rows.map(row=>row.map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(",")).join("\r\n");
}
