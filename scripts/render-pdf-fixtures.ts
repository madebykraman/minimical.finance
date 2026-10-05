import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderInvoicePdf } from "../lib/finance/invoice-pdf";
import { renderReceiptPdf } from "../lib/finance/receipt-pdf";
import { renderStatementPdf } from "../lib/finance/statement-pdf";

const out=join(process.cwd(),"artifacts","pdf-fixtures");
await mkdir(out,{recursive:true});

const organization={
  name:"Enchanted Vows Studio & Production Company",
  legal_name:"Enchanted Vows Studio & Production Company Private Limited",
  email:"accounts@example.com",
  phone:"+91 98765 43210",
  address_lines:["48 Long Business Avenue","Creative District","Mumbai, Maharashtra 400001"],
  pan:"ABCDE1234F",
  gstin:"27ABCDE1234F1Z5",
  payee_name:"Enchanted Vows Studio & Production Company Private Limited",
  account_number:"123456789012",
  bank_name:"Example Bank",
  branch_name:"Fort Business Branch",
  branch_code:"00123",
  ifsc_code:"EXAM0123456",
  invoice_footer_line_1:"Please contact accounts@example.com for billing queries.",
  invoice_footer_line_2:"Thank you for your time.",
};
const client={
  name:"Ogaan Media and Lifestyle Ventures",
  legal_name:"Ogaan Media and Lifestyle Ventures Private Limited",
  email:"finance@client.example",
  address_lines:["A deliberately long first billing-address line for wrapping verification","Second Floor, Example Commercial Complex","New Delhi, Delhi 110001"],
  pan:"AAAAA1111A",
  gstin:"07AAAAA1111A1Z1",
};
const contents=Array.from({length:18},(_,index)=>({
  id:`fixture-${index+1}`,
  position:index,
  kind:"service",
  title:index===3
    ?"A deliberately long editorial deliverable title that must wrap without colliding with the amount column"
    :`Editorial deliverable ${String(index+1).padStart(2,"0")}`,
  description:index===8?"Long-form description used to verify controlled wrapping, readable line heights and continuation-page geometry.":null,
  note:index===12?"Client-facing line note for spacing verification.":null,
  quantity:1,
  rate:index===16?null:1500+index*125,
  amount:index===16?null:1500+index*125,
  priced:index!==16,
  assigned_by:index%2?"Ekta":"Sharon",
}));
const invoice={
  id:"00000000-0000-0000-0000-000000000001",
  invoice_number:"FIX-220",
  issue_date:"2026-10-05",
  due_date:"2026-11-04",
  source_total:null,
  status:"sent",
};
const calculatedTotal=contents.reduce((sum,item)=>sum+(item.priced?Number(item.amount||0):0),0);

const invoiceLegacy=await renderInvoicePdf({
  invoice,organization,client,projectName:"Elle India — Video Editing & Editorial Production",contents,templateKey:"legacy_elle",
});
await writeFile(join(out,"invoice-legacy.pdf"),invoiceLegacy);

const invoiceClean=await renderInvoicePdf({
  invoice:{...invoice,invoice_number:"FIX-CLEAN"},organization,client,projectName:"Long-form campaign project",contents,templateKey:"clean",
});
await writeFile(join(out,"invoice-clean.pdf"),invoiceClean);

const receipt=await renderReceiptPdf({
  organization,client,invoiceNumber:"FIX-220",invoiceTotal:calculatedTotal,invoiceBalance:7250,
  payment:{amount:12500,payment_date:"2026-10-05",method:"bank_transfer",reference:"UTR-FIXTURE-20261005",receipt_number:"RCP-FIX-220"},
});
await writeFile(join(out,"receipt.pdf"),receipt);

const rows=[
  {transaction_date:"2026-04-01",transaction_type:"invoice",reference:"INV-001",debit:10000,credit:0,running_balance:10000},
  {transaction_date:"2026-04-15",transaction_type:"payment",reference:"RCP-001",debit:0,credit:4000,running_balance:6000},
  ...Array.from({length:26},(_,index)=>({
    transaction_date:`2026-${String(5+Math.floor(index/6)).padStart(2,"0")}-${String(1+(index%6)*4).padStart(2,"0")}`,
    transaction_type:index%3===0?"payment":"invoice",
    reference:`${index%3===0?"RCP":"INV"}-${String(index+2).padStart(3,"0")}`,
    debit:index%3===0?0:2500+index*50,
    credit:index%3===0?1800+index*25:0,
    running_balance:6000+index*700,
  })),
];
const statement=await renderStatementPdf({
  organization,client,periodLabel:"FY 2026-27",periodStart:"2026-04-01",periodEnd:"2027-03-31",rows,openingBalance:0,
});
await writeFile(join(out,"statement.pdf"),statement);

console.log(`Rendered PDF fixtures to ${out}`);
