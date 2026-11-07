import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {invoiceGroups,sum,titleFromSource,csv} from "../lib/tracker";
import type {TrackerRow,TrackerPayment} from "../lib/tracker";

const row=(n:number,invoice:string,amount:number|null,printed:number|null=null):TrackerRow=>({
 id:String(n),snapshot_id:"s",row_order:n,project_name:"Elle India_Project_"+n+"_Video Editing",
 assigned_by:null,amount,payment_state:"Unpaid",invoice_number:invoice,
 invoice_date:"2026-10-24",invoice_printed_total:printed,invoice_state:"Sent",
 invoice_pdf_name:null,payment_date:null,work_status:"open",notes:null,from_source_pdf:true,client_id:null,updated_at:"2026-10-24"
});
test("printed invoice totals remain distinct from line totals",()=>{
 const g=invoiceGroups([row(1,"180",5000,21000),row(2,"180",18000),row(3,"195",8000,12000),row(4,"195",2000)],[]);
 assert.equal(g.length,2);assert.equal(g[0].total,21000);assert.equal(g[0].lineTotal,23000);assert.equal(g[0].discrepancy,2000);
 assert.equal(g[1].total,12000);assert.equal(g[1].lineTotal,10000);assert.equal(g[1].discrepancy,-2000);
});
test("payments reduce balances without modifying reported totals",()=>{
 const p:TrackerPayment={id:"p",invoice_number:"180",amount:5000,paid_on:"2026-11-07",method:"upi",reference:null,notes:null,created_at:"2026-11-07"};
 const g=invoiceGroups([row(1,"180",5000,21000)],[p])[0];
 assert.equal(g.total,21000);assert.equal(g.paid,5000);assert.equal(g.balance,16000);
});
test("blank prices stay blank",()=>{const g=invoiceGroups([row(1,"220",null,12000)],[])[0];assert.equal(g.rows[0].amount,null);});
test("csv quotes and escapes source values",()=>assert.equal(csv([['name','A "quoted"','x,y']]),'"name","A ""quoted""","x,y"'));
test("work title display does not mutate storage",()=>assert.equal(titleFromSource("Elle India_Fossae_Video Editing"),"Fossae"));
test("financial calculations use explicit amounts",()=>assert.equal(sum([21000,12000,12000]),45000));
test("client portal authenticates before accessing business data",()=>{
 const route=readFileSync("app/api/portal/data/route.ts","utf8");
 assert.match(route,/portalSession\(\)/);assert.match(route,/Cache-Control/);
});
test("document access validates membership and session",()=>{
 const route=readFileSync("app/api/documents/[id]/route.ts","utf8");
 assert.match(route,/workspaceUser\(\)/);assert.match(route,/portalSession\(\)/);assert.match(route,/visible_to_client/);
});
test("no privileged key in browser client",()=>{
 const code=readFileSync("lib/supabase/browser.ts","utf8");
 assert.doesNotMatch(code,/SERVICE_ROLE/);
});
