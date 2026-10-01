import test from "node:test";
import assert from "node:assert/strict";
import { calculateStats, contentAmount, invoiceBalance, invoiceTotal, paidTotal, daysOverdue, paymentTransition } from "../lib/finance/domain";

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
