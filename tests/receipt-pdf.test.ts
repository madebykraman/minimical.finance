import test from "node:test";
import assert from "node:assert/strict";
import {PDFDocument} from "pdf-lib";
import {renderPaymentReceipt} from "../lib/ledger/receipt-pdf";
import type {TrackerPayment} from "../lib/tracker";
test("generates a valid payment PDF for any organisation from real payment details",async()=>{
 const payment={id:"b05b251e-32fb-4f4a-99ca-3522811de0e8",invoice_number:"INV-23",amount:1200,paid_on:"2026-11-08",method:"upi",reference:"TX-001",notes:null} as TrackerPayment;
 const bytes=await renderPaymentReceipt({organization:{name:"Enchated Vows"},client:{name:"Sample client"},payment});
 assert.equal(Buffer.from(bytes.slice(0,5)).toString(),"%PDF-");
 const loaded=await PDFDocument.load(bytes);
 assert.equal(loaded.getPageCount(),1);
 assert.match(loaded.getTitle()||"",/Enchated Vows/);
});
test("refuses a non-payment rather than fabricate a receipt",async()=>{
 const payment={invoice_number:"INV-21",amount:0} as TrackerPayment;
 await assert.rejects(()=>renderPaymentReceipt({organization:{name:"Kumar Aman"},client:null,payment}),/Invalid payment/);
});
