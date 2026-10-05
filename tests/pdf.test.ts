import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("invoice PDF routes delegate to one shared renderer",()=>{
 const renderer=readFileSync("lib/finance/invoice-pdf.ts","utf8");
 for(const path of ["app/api/invoices/[id]/pdf/route.ts","app/api/client-portal/[slug]/invoice/[id]/pdf/route.ts"]){
  const route=readFileSync(path,"utf8");
  assert.match(route,/renderInvoicePdf/);
  assert.doesNotMatch(route,/PDFDocument/);
 }
 assert.match(renderer,/Geist-Regular\.ttf/);
 assert.match(renderer,/Geist-SemiBold\.ttf/);
 assert.match(renderer,/GeistMono-Regular\.ttf/);
 assert.match(renderer,/62\.42/);
 assert.match(renderer,/419\.3/);
});
test("receipt PDF routes delegate to one shared renderer",()=>{
 const renderer=readFileSync("lib/finance/receipt-pdf.ts","utf8");
 for(const path of ["app/api/payments/[id]/receipt/route.ts","app/api/client-portal/[slug]/receipt/[paymentId]/route.ts"]){
  const route=readFileSync(path,"utf8");
  assert.match(route,/renderReceiptPdf/);
  assert.doesNotMatch(route,/PDFDocument/);
 }
 assert.match(renderer,/Geist-Regular\.ttf/);
 assert.match(renderer,/Geist-SemiBold\.ttf/);
 assert.match(renderer,/GeistMono-Regular\.ttf/);
 assert.match(renderer,/clientLogo/);
 assert.match(renderer,/orgLogo/);
});
test("statement PDF route delegates to the shared Geist renderer",()=>{
  const route=readFileSync("app/api/client-portal/[slug]/statement/route.ts","utf8");
  const renderer=readFileSync("lib/finance/statement-pdf.ts","utf8");
  assert.doesNotMatch(route,/DejaVu/i);
  assert.match(route,/renderStatementPdf/);
  assert.match(renderer,/Geist-Regular\.ttf/);
  assert.match(renderer,/Geist-SemiBold\.ttf/);
  assert.match(renderer,/GeistMono-Regular\.ttf/);
});
test("canonical invoice never truncates contents and supports continuation pages",()=>{
 const s=readFileSync("lib/finance/invoice-pdf.ts","utf8");
 assert.doesNotMatch(s,/contents\.slice\(0,\s*4\)/);
 assert.match(s,/paginateItems/);
 assert.match(s,/CONTINUED/);
});

test("PDF font preparation is deterministic",()=>{
 const s=readFileSync("scripts/prepare-pdf-font.mjs","utf8");
 assert.match(s,/geist/);
 assert.match(s,/Geist-Regular\.ttf/);
 assert.match(s,/Geist-SemiBold\.ttf/);
 assert.match(s,/GeistMono-Regular\.ttf/);
});


test("financial PDF renderers never hard-code account identity",()=>{
 const paths=[
  "lib/finance/invoice-pdf.ts",
  "lib/finance/receipt-pdf.ts",
  "lib/finance/statement-pdf.ts",
 ];
 for(const path of paths){
  const s=readFileSync(path,"utf8");
  assert.doesNotMatch(s,/framedbyaman@gmail\.com/i,path);
  assert.doesNotMatch(s,/87095\s*39814/i,path);
  assert.doesNotMatch(s,/Kumar Aman/i,path);
 }
});


test("portal invoice renderer prefers issued snapshots",()=>{
 const s=readFileSync("app/api/client-portal/[slug]/invoice/[id]/pdf/route.ts","utf8");
 assert.match(s,/invoice_versions/);
 assert.match(s,/issued_version/);
 assert.match(s,/snapshot\.organization/);
 assert.match(s,/snapshot\.client/);
 assert.match(s,/snapshot\.contents/);
});


test("shared invoice renderer preserves authoritative source total when present",()=>{
 const s=readFileSync("lib/finance/invoice-pdf.ts","utf8");
 assert.match(s,/hasAuthoritativeTotal/);
 assert.match(s,/source_total/);
 assert.match(s,/templateKey==="clean"/);
});


test("shared invoice renderer contains no product attribution",()=>{
 const s=readFileSync("lib/finance/invoice-pdf.ts","utf8");
 assert.doesNotMatch(s,/\bMinBooks\b/);
});


test("statement renderer carries both organisation and client logos",()=>{
 const s=readFileSync("lib/finance/statement-pdf.ts","utf8");
 assert.match(s,/orgLogo/);
 assert.match(s,/clientLogo/);
});


test("receipt renderer includes remaining balance and payee identity",()=>{
 const s=readFileSync("lib/finance/receipt-pdf.ts","utf8");
 assert.match(s,/REMAINING BALANCE/);
 assert.match(s,/PAYEE/);
 assert.match(s,/account_number/);
 assert.match(s,/ifsc_code/);
});


test("statement routes persist canonical document versions",()=>{
 for(const path of ["app/api/clients/[id]/statement/route.ts","app/api/client-portal/[slug]/statement/route.ts"]){
  const s=readFileSync(path,"utf8");
  assert.match(s,/document_versions/);
  assert.match(s,/statement_pdf/);
  assert.match(s,/sourceHash/);
  assert.match(s,/finos-documents/);
  assert.match(s,/storage[\s\S]*upload/);
 }
});
