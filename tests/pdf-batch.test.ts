import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PDFDocument} from "pdf-lib";
import {renderInvoicePdf} from "../lib/ledger/invoice-pdf";
import {invoiceGroups,type TrackerPayment,type TrackerRow} from "../lib/tracker";

test("all eight opening invoice groups render and combine without mutating their totals",async()=>{
 const values:[string,number,boolean][]=[
  ["21",4000,true],["43",6000,true],["106",16500,true],["160",19500,true],
  ["166",3000,true],["180",21000,false],["195",12000,false],["220",12000,false]
 ];
 const items=values.map(([number,total,paid],index)=>({
  id:"fixture-"+number,snapshot_id:"fixture",row_order:index+1,project_name:"Elle India_Test_"+number+"_Video Editing",
  assigned_by:"Editor",amount:total,quantity:1,unit_price:total,payment_state:paid?"Paid":"Unpaid",invoice_number:number,
  invoice_date:"2026-11-01",invoice_printed_total:total,invoice_state:"Sent",invoice_pdf_name:null,payment_date:null,
  work_status:"complete",notes:null,from_source_pdf:false,client_id:"fixture",updated_at:"2026-11-01",
  source_paid:paid,source_paid_on:null
 })) as TrackerRow[];
 const groups=invoiceGroups(items,[] as TrackerPayment[]);
 assert.equal(groups.length,8);
 assert.equal(groups.reduce((n,g)=>n+g.total,0),94000);
 assert.equal(groups.reduce((n,g)=>n+g.balance,0),45000);
 const all=await PDFDocument.create();
 for(const invoice of groups){
  const bytes=await renderInvoicePdf({organization:{name:"Kumar Aman"},client:{name:"Elle India"},invoice});
  assert.equal(Buffer.from(bytes.subarray(0,5)).toString(),"%PDF-");
  const doc=await PDFDocument.load(bytes);
  const pages=await all.copyPages(doc,doc.getPageIndices());
  pages.forEach(page=>all.addPage(page));
 }
 const result=await PDFDocument.load(await all.save());
 assert.equal(result.getPageCount(),8);
});

test("batch PDF route is authenticated, org-scoped, and declines ambiguous client data",()=>{
 const source=readFileSync("app/api/invoices/pdf/route.ts","utf8");
 assert.match(source,/workspaceUser\(\)/);
 assert.match(source,/eq\("organization_id",orgId\)/);
 assert.match(source,/ids.length>1/);
 assert.match(source,/renderInvoicePdf/);
 assert.match(source,/copyPages/);
 assert.match(source,/Cache-Control/);
});

test("editors show server-side errors in the active dialog, not behind it",()=>{
 const source=readFileSync("components/ledger/FinanceStudio.tsx","utf8");
 assert.match(source,/fs-dialog-error/);
 assert.match(source,/error=\{error\}/);
 assert.match(source,/tracker_revise_invoice/);
 assert.match(source,/fs-form-disclosure/);
});
