import test from "node:test";
import assert from "node:assert/strict";
import { calculateStats, contentAmount, invoiceBalance, invoiceTotal, paidTotal, daysOverdue, isInvoiceOverdue, paymentTransition } from "../lib/finance/domain";
import { ALL_ORGANIZATIONS_ID, isAllOrganizationsScope } from "../lib/finance/types";

const base={id:"1",number:"180",client:"Elle India",project:"Video Editing",date:"2026-08-05",dueDate:"2026-09-04",status:"sent" as const,sourceTotal:10000,notes:null,adjustment:null,organizationId:null,clientId:null,projectId:null,contents:[
{id:"a",title:"The Devil Wears Prada 2",kind:"service" as const,quantity:1,rate:2000,amount:2000,priced:true},
{id:"b",title:"Salim Merchar",kind:"service" as const,quantity:1,rate:2000,amount:2000,priced:true},
{id:"c",title:"TBD",kind:"service" as const,quantity:1,rate:null,amount:null,priced:false},
],payments:[{id:"p",amount:2000,payment_date:"2026-08-20",method:"bank_transfer" as const,reference:null,notes:null,receipt_number:"RCP-180"}],activities:[]};

test("invoice totals exclude unpriced content",()=>{assert.equal(contentAmount(base.contents[0]),2000);assert.equal(invoiceTotal(base),4000);assert.equal(paidTotal(base),2000);assert.equal(invoiceBalance(base),2000)});
test("invoice statistics expose unpriced work",()=>{const stats=calculateStats([base]);assert.equal(stats.billed,4000);assert.equal(stats.collected,2000);assert.equal(stats.outstanding,2000);assert.equal(stats.unpricedCount,1)});
test("overdue calculation is date based",()=>{assert.ok(daysOverdue({...base,dueDate:"2026-01-01"} )>0)});

test("payment transitions are deterministic",()=>{
 assert.equal(paymentTransition(1000,0),"no_payment");
 assert.equal(paymentTransition(1000,400),"partial");
 assert.equal(paymentTransition(1000,1000),"paid");
 assert.equal(paymentTransition(1000,1200),"paid");
});


test("overdue state respects balance and void status",()=>{
 const today=new Date("2026-10-01T12:00:00");
 assert.equal(isInvoiceOverdue({...base,dueDate:"2026-09-30",status:"sent"},today),true);
 assert.equal(isInvoiceOverdue({...base,dueDate:"2026-09-30",status:"paid",payments:[{...base.payments[0],amount:4000}]},today),false);
 assert.equal(isInvoiceOverdue({...base,dueDate:"2026-09-30",status:"void"},today),false);
 assert.equal(isInvoiceOverdue({...base,dueDate:"2026-10-02",status:"sent"},today),false);
});

test("zero-billed invoices never report a positive collection rate",()=>{
 const zero={...base,contents:base.contents.map(c=>({...c,priced:false,amount:null,rate:null})),payments:[]};
 const stats=calculateStats([zero]);
 assert.equal(stats.billed,0);
 assert.equal(stats.collected,0);
 assert.equal(stats.outstanding,0);
 assert.equal(stats.rate,0);
});


test("aggregate organisation scope is never treated as an organisation UUID",()=>{
 assert.equal(isAllOrganizationsScope(ALL_ORGANIZATIONS_ID),true);
 assert.equal(isAllOrganizationsScope("00000000-0000-0000-0000-000000000000"),false);
 assert.equal(isAllOrganizationsScope(null),false);
});
